"use client";

import { useEffect } from "react";

import { resumeUnfinishedReplies } from "../lib/stream-manager";

/** After a refresh, continue any reply that was still being generated. */
export function ResumeReplies() {
  useEffect(() => {
    void resumeUnfinishedReplies();
  }, []);
  return null;
}
