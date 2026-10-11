"use client";

import { useCallback, useEffect, useState } from "react";

/** Boolean composer toggle (e.g. Think, Search), remembered per browser. */
function useTogglePreference(storageKey: string) {
  const [value, setValue] = useState(false);

  useEffect(() => {
    try {
      setValue(localStorage.getItem(storageKey) === "1");
    } catch {
      // Storage unavailable — default off.
    }
  }, [storageKey]);

  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // Ignore — preference just won't persist.
      }
    },
    [storageKey],
  );

  return [value, update] as const;
}

export const useThinking = () => useTogglePreference("solomon:thinking");
export const useWebSearch = () => useTogglePreference("solomon:web-search");
