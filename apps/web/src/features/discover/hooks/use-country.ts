"use client";

import { useCallback, useEffect, useState } from "react";

import { COUNTRY_CODES, type CountryCode } from "../config";

const STORAGE_KEY = "solomon:discover-country";

function isCountry(value: string | null | undefined): value is CountryCode {
  return !!value && (COUNTRY_CODES as readonly string[]).includes(value);
}

/** Discover country: saved choice, else the browser locale's region, else US. */
export function useCountry() {
  const [country, setCountryState] = useState<CountryCode | null>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage unavailable — fall back to the locale.
    }
    const region = navigator.language.split("-")[1]?.toUpperCase();
    setCountryState(isCountry(saved) ? saved : isCountry(region) ? region : "US");
  }, []);

  const setCountry = useCallback((next: CountryCode) => {
    setCountryState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore — choice just won't persist.
    }
  }, []);

  return [country, setCountry] as const;
}
