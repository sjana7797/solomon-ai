"""
Field-level encryption for stored chats (envelope encryption).

Each chat has a random 256-bit data key (DEK). The DEK is stored wrapped by a
master key from settings; titles and message bodies are AES-256-GCM encrypted
under the DEK. Associated data binds each ciphertext to its row, so a value
copied into another row fails to decrypt.

Token format: "v1.<nonce>.<ciphertext+tag>" (base64url, unpadded).
"""

from __future__ import annotations

import base64
import os
from functools import lru_cache
from uuid import UUID

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.api.settings import settings

_VERSION = "v1"
_NONCE_BYTES = 12
_KEY_BYTES = 32


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _seal(key: bytes, plaintext: bytes, aad: str) -> str:
    nonce = os.urandom(_NONCE_BYTES)
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, aad.encode())
    return f"{_VERSION}.{_b64encode(nonce)}.{_b64encode(ciphertext)}"


def _open(key: bytes, token: str, aad: str) -> bytes:
    version, nonce, ciphertext = token.split(".")
    if version != _VERSION:
        raise ValueError(f"Unsupported ciphertext version: {version}")
    return AESGCM(key).decrypt(_b64decode(nonce), _b64decode(ciphertext), aad.encode())


def title_aad(chat_id: UUID) -> str:
    return f"chat-title:{chat_id}"


def message_aad(message_id: UUID) -> str:
    return f"message:{message_id}"


def reasoning_aad(message_id: UUID) -> str:
    return f"message-reasoning:{message_id}"


def sources_aad(message_id: UUID) -> str:
    return f"message-sources:{message_id}"


def images_aad(message_id: UUID) -> str:
    return f"message-images:{message_id}"


def image_aad(image_id: UUID) -> str:
    return f"image:{image_id}"


def image_prompt_aad(image_id: UUID) -> str:
    return f"image-prompt:{image_id}"


def document_title_aad(document_id: UUID) -> str:
    return f"document-title:{document_id}"


def chunk_aad(chunk_id: UUID) -> str:
    return f"chunk:{chunk_id}"


class ChatCipher:
    def __init__(self, keyring: dict[str, bytes], active_key_id: str) -> None:
        if active_key_id not in keyring:
            raise ValueError("CHAT_ENCRYPTION_ACTIVE_KEY_ID is not in CHAT_ENCRYPTION_KEYS")
        for key_id, key in keyring.items():
            if len(key) != _KEY_BYTES:
                raise ValueError(f"Master key {key_id!r} must be {_KEY_BYTES} bytes")
        self._keyring = keyring
        self._active_key_id = active_key_id

    @classmethod
    def from_settings(cls) -> ChatCipher:
        if not settings.CHAT_ENCRYPTION_KEYS:
            raise ValueError("CHAT_ENCRYPTION_KEYS is not configured")
        keyring: dict[str, bytes] = {}
        for entry in settings.CHAT_ENCRYPTION_KEYS.split(","):
            key_id, _, encoded = entry.strip().partition(":")
            keyring[key_id] = base64.b64decode(encoded)
        return cls(keyring, settings.CHAT_ENCRYPTION_ACTIVE_KEY_ID)

    def new_data_key(self, chat_id: UUID) -> tuple[bytes, str, str]:
        # Also used for documents: the id binds the wrapped key to its row.
        """Returns (dek, wrapped_dek, master_key_id)."""
        dek = AESGCM.generate_key(bit_length=256)
        master = self._keyring[self._active_key_id]
        return dek, _seal(master, dek, f"dek:{chat_id}"), self._active_key_id

    def unwrap_data_key(self, chat_id: UUID, wrapped: str, key_id: str) -> bytes:
        return _open(self._keyring[key_id], wrapped, f"dek:{chat_id}")

    @staticmethod
    def encrypt(dek: bytes, plaintext: str, aad: str) -> str:
        return _seal(dek, plaintext.encode(), aad)

    @staticmethod
    def decrypt(dek: bytes, token: str, aad: str) -> str:
        return _open(dek, token, aad).decode()

    @staticmethod
    def encrypt_bytes(dek: bytes, data: bytes, aad: str) -> bytes:
        """Binary variant for large payloads (images): nonce || ciphertext+tag."""
        nonce = os.urandom(_NONCE_BYTES)
        return nonce + AESGCM(dek).encrypt(nonce, data, aad.encode())

    @staticmethod
    def decrypt_bytes(dek: bytes, blob: bytes, aad: str) -> bytes:
        return AESGCM(dek).decrypt(blob[:_NONCE_BYTES], blob[_NONCE_BYTES:], aad.encode())


@lru_cache
def get_chat_cipher() -> ChatCipher:
    return ChatCipher.from_settings()
