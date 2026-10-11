"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { fetchModels } from "../api/ai-client";

const STORAGE_KEY = "solomon:model";

export function useModels() {
  return useQuery({
    queryKey: ["ai", "models"],
    queryFn: ({ signal }) => fetchModels(signal),
    staleTime: 5 * 60 * 1000,
  });
}

/** Model for new chats: last pick (per browser), falling back to the first available model. */
export function usePreferredModel() {
  const { data: models } = useModels();
  const [stored, setStored] = useState<string | null>(null);

  useEffect(() => {
    try {
      setStored(localStorage.getItem(STORAGE_KEY));
    } catch {
      // Storage unavailable (private mode etc.) — keep the default.
    }
  }, []);

  const setModel = useCallback((model: string) => {
    setStored(model);
    try {
      localStorage.setItem(STORAGE_KEY, model);
    } catch {
      // Ignore — preference just won't persist.
    }
  }, []);

  const model =
    stored && models?.some((m) => m.id === stored) ? stored : models?.[0]?.id;

  return [model, setModel] as const;
}
