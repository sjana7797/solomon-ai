/*
 * End-to-end encryption keys (WebCrypto only; nothing here touches the network).
 *
 * The account key (32 random bytes) is made in the browser. The server only
 * stores it wrapped with AES-256-GCM under two key-encryption keys:
 * - passphrase → PBKDF2-SHA-256 (600k iterations, random salt),
 * - recovery key (32 random bytes, shown once) → HKDF-SHA-256.
 * The user id is bound in as associated data, so a wrapped key can't be moved
 * to another account. On this device the unwrapped key is kept as a
 * non-extractable CryptoKey (see key-store.ts).
 */

export const PASSPHRASE_MIN_LENGTH = 12;

/** Key bytes (backed by a plain ArrayBuffer, as WebCrypto requires). */
export type Bytes = Uint8Array<ArrayBuffer>;

export type KdfParams = { name: "PBKDF2"; hash: "SHA-256"; iterations: number };
const KDF: KdfParams = { name: "PBKDF2", hash: "SHA-256", iterations: 600_000 };

/** What the server stores (all base64). */
export interface WrappedKeys {
  passphraseWrapped: string;
  passphraseSalt: string;
  passphraseKdf: KdfParams;
  recoveryWrapped: string;
  recoverySalt: string;
}

export class WrongSecretError extends Error {
  constructor() {
    super("That doesn't unlock this account.");
  }
}

const encoder = new TextEncoder();

const toBase64 = (bytes: Bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Bytes => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const random = (length: number): Bytes => crypto.getRandomValues(new Uint8Array(length));
const aad = (userId: string) => encoder.encode(`solomon:account-key:v1:${userId}`);

// Crockford base32: no I, L, O, U, so the recovery key is easy to read and type.
const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function toRecoveryText(bytes: Bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join("-");
}

function fromRecoveryText(text: string) {
  const clean = text
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new WrongSecretError();
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  if (out.length < 32) throw new WrongSecretError();
  return new Uint8Array(out.slice(0, 32));
}

async function passphraseKek(passphrase: string, salt: Bytes, kdf: KdfParams) {
  const base = await crypto.subtle.importKey("raw", encoder.encode(passphrase.normalize("NFKC")), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { ...kdf, salt },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function recoveryKek(recovery: Bytes, salt: Bytes) {
  const base = await crypto.subtle.importKey("raw", recovery, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode("solomon recovery key") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function wrap(kek: CryptoKey, accountKey: Bytes, userId: string) {
  const iv = random(12);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(userId) }, kek, accountKey),
  );
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return toBase64(out);
}

async function unwrap(kek: CryptoKey, wrapped: string, userId: string) {
  const bytes = fromBase64(wrapped);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: aad(userId) },
        kek,
        bytes.slice(12),
      ),
    );
  } catch {
    throw new WrongSecretError();
  }
}

/** The account key for use on this device: can encrypt/decrypt, can't be exported. */
export function importAccountKey(raw: Bytes) {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Wrap an account key under a (new) passphrase. */
export async function wrapWithPassphrase(raw: Bytes, userId: string, passphrase: string) {
  const salt = random(16);
  const kek = await passphraseKek(passphrase, salt, KDF);
  return {
    passphraseWrapped: await wrap(kek, raw, userId),
    passphraseSalt: toBase64(salt),
    passphraseKdf: KDF,
  };
}

/** New account key, wrapped for the server, plus the recovery key to show once. */
export async function createVault(userId: string, passphrase: string) {
  const raw = random(32);
  const recovery = random(32);
  const recoverySalt = random(16);
  const keys: WrappedKeys = {
    ...(await wrapWithPassphrase(raw, userId, passphrase)),
    recoveryWrapped: await wrap(await recoveryKek(recovery, recoverySalt), raw, userId),
    recoverySalt: toBase64(recoverySalt),
  };
  return { keys, recoveryKey: toRecoveryText(recovery), accountKey: await importAccountKey(raw) };
}

/** Raw account key from the passphrase (throws WrongSecretError). */
export async function openWithPassphrase(keys: WrappedKeys, userId: string, passphrase: string) {
  const kek = await passphraseKek(passphrase, fromBase64(keys.passphraseSalt), keys.passphraseKdf);
  return unwrap(kek, keys.passphraseWrapped, userId);
}

/** Raw account key from the recovery key (throws WrongSecretError). */
export async function openWithRecoveryKey(keys: WrappedKeys, userId: string, recoveryKey: string) {
  const kek = await recoveryKek(fromRecoveryText(recoveryKey), fromBase64(keys.recoverySalt));
  return unwrap(kek, keys.recoveryWrapped, userId);
}
