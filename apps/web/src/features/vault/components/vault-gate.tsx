"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useVault } from "../hooks/use-vault";

/** Signed-in users set up or unlock encryption before using the app. */
export function VaultGate() {
  const { status } = useVault();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "needs-setup" || status === "locked") {
      router.replace(`/vault?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  return null;
}
