"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { memoryApi } from "../api";
import type { MemoryState } from "../types";

const KEY = ["memory"] as const;

export function useMemory() {
  return useQuery({ queryKey: KEY, queryFn: memoryApi.get });
}

export function useMemoryActions() {
  const client = useQueryClient();
  const patch = (update: (state: MemoryState) => MemoryState) =>
    client.setQueryData<MemoryState>(KEY, (state) => (state ? update(state) : state));
  const refresh = () => client.invalidateQueries({ queryKey: KEY });

  const setEnabled = useMutation({
    mutationFn: memoryApi.setEnabled,
    onMutate: (enabled) => patch((s) => ({ ...s, enabled })),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: memoryApi.remove,
    onMutate: (id) => patch((s) => ({ ...s, memories: s.memories.filter((m) => m.id !== id) })),
    onSettled: refresh,
  });
  const clear = useMutation({
    mutationFn: memoryApi.clear,
    onMutate: () => patch((s) => ({ ...s, memories: [] })),
    onSettled: refresh,
  });
  return { setEnabled, remove, clear };
}
