"use client";

import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { useState } from "react";

import { delay, rise } from "@/features/auth/components/form-ui";

/** Shows the recovery key once, with copy and download. */
export function RecoveryKeyCard({ recoveryKey, email }: { recoveryKey: string; email: string }) {
  const [copied, setCopied] = useState(false);
  const groups = recoveryKey.split("-");

  const download = () => {
    const text = `Solomon recovery key for ${email}\n\n${recoveryKey}\n\nKeep this somewhere safe. With your passphrase lost, it's the only way to unlock your chats.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "solomon-recovery-key.txt" });
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`${rise} w-full rounded-2xl border border-border/70 bg-card p-4`} style={delay(3)}>
      <div className="grid grid-cols-4 gap-x-3 gap-y-2 font-mono text-[0.95rem] tracking-wider select-all">
        {groups.map((group, i) => (
          <span key={i} className="rounded-md bg-muted/70 py-1 text-center">
            {group}
          </span>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(recoveryKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-muted text-sm transition-colors hover:bg-muted/70"
        >
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={download}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-muted text-sm transition-colors hover:bg-muted/70"
        >
          <DownloadIcon className="size-4" />
          Download
        </button>
      </div>
    </div>
  );
}
