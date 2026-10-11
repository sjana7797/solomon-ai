"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { fetchDocuments, uploadDocument } from "../api/ai-client";
import { updateChat } from "../db/repository";
import type { Chat, UploadedDocument } from "../types";

export interface Attachment {
  key: string;
  title: string;
  /** Set once the upload is accepted. */
  documentId?: string;
  status: "uploading" | UploadedDocument["status"];
  error?: string | null;
  /** Already part of the chat (vs. attached in the composer, not yet sent). */
  persisted: boolean;
}

/**
 * Files for RAG: the chat's saved documents plus files attached in the composer
 * that haven't been sent yet. Polls indexing status until every file is ready.
 */
export function useAttachments(chat: Chat | null | undefined) {
  const [uploading, setUploading] = useState<{ key: string; title: string; error?: string }[]>([]);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  const savedIds = useMemo(() => chat?.documentIds ?? [], [chat?.documentIds]);
  const allIds = useMemo(() => [...new Set([...savedIds, ...pendingIds])], [savedIds, pendingIds]);

  const { data: docs } = useQuery({
    queryKey: ["documents", allIds],
    queryFn: ({ signal }) => fetchDocuments(allIds, signal),
    enabled: allIds.length > 0,
    // Poll while indexing, even if the user switched tabs during the upload.
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.status === "processing") ? 1500 : false,
    refetchIntervalInBackground: true,
  });

  const byId = useMemo(() => new Map(docs?.map((d) => [d.id, d])), [docs]);

  const attachments: Attachment[] = [
    ...allIds.map((id) => {
      const doc = byId.get(id);
      return {
        key: id,
        title: doc?.title ?? "File",
        documentId: id,
        status: doc?.status ?? "processing",
        error: doc?.error,
        persisted: savedIds.includes(id),
      };
    }),
    ...uploading.map((u) => ({
      key: u.key,
      title: u.title,
      status: u.error ? ("failed" as const) : ("uploading" as const),
      error: u.error,
      persisted: false,
    })),
  ];

  const addFiles = useCallback(async (files: File[]) => {
    await Promise.all(
      files.map(async (file) => {
        const key = crypto.randomUUID();
        setUploading((list) => [...list, { key, title: file.name }]);
        try {
          const doc = await uploadDocument(file);
          setUploading((list) => list.filter((u) => u.key !== key));
          setPendingIds((ids) => [...ids, doc.id]);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          setUploading((list) => list.map((u) => (u.key === key ? { ...u, error: message } : u)));
        }
      }),
    );
  }, []);

  const remove = useCallback(
    (attachment: Attachment) => {
      if (!attachment.documentId) {
        setUploading((list) => list.filter((u) => u.key !== attachment.key));
      } else if (attachment.persisted && chat) {
        // Detach from this chat; the file itself stays in the user's library.
        void updateChat(chat.id, {
          documentIds: savedIds.filter((id) => id !== attachment.documentId),
        });
      } else {
        setPendingIds((ids) => ids.filter((id) => id !== attachment.documentId));
      }
    },
    [chat, savedIds],
  );

  /** Ids to send with the next message (moved into the chat on send). */
  const takePending = useCallback(() => {
    const ids = pendingIds.filter((id) => byId.get(id)?.status === "ready");
    setPendingIds([]);
    setUploading((list) => list.filter((u) => !u.error));
    return ids;
  }, [pendingIds, byId]);

  const indexing = attachments.some((a) => a.status === "uploading" || a.status === "processing");

  return { attachments, addFiles, remove, takePending, indexing };
}
