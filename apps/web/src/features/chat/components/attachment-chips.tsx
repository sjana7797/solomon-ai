"use client";

import { Loader } from "@repo/ui/components/motion/loader";
import { cn } from "@repo/ui/lib/utils";
import { CircleAlertIcon, FileTextIcon, XIcon } from "lucide-react";

import type { Attachment } from "../hooks/use-attachments";

const STATUS_LABEL: Record<Attachment["status"], string> = {
  uploading: "Uploading…",
  processing: "Indexing…",
  ready: "Ready",
  failed: "Failed",
};

export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: Attachment[];
  onRemove: (attachment: Attachment) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attached files">
      {attachments.map((attachment) => {
        const busy = attachment.status === "uploading" || attachment.status === "processing";
        const failed = attachment.status === "failed";
        return (
          <li
            key={attachment.key}
            title={attachment.error ?? undefined}
            className={cn(
              "flex max-w-64 items-center gap-2 rounded-xl border bg-card py-1.5 pr-1.5 pl-2 text-xs",
              failed && "border-destructive/40 bg-destructive/10",
            )}
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-lg bg-chart-1/60 text-primary-foreground",
                failed && "bg-destructive/15 text-destructive",
              )}
            >
              {busy ? (
                <Loader variant="dots" size={12} label={STATUS_LABEL[attachment.status]} />
              ) : failed ? (
                <CircleAlertIcon className="size-3.5" />
              ) : (
                <FileTextIcon className="size-3.5" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{attachment.title}</span>
              <span className={cn("block text-muted-foreground", failed && "text-destructive")}>
                {failed ? (attachment.error ?? "Failed") : STATUS_LABEL[attachment.status]}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onRemove(attachment)}
              aria-label={`Remove ${attachment.title}`}
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
