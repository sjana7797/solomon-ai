import { Suspense } from "react";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { VaultFlow } from "@/features/vault/components/vault-flow";

export default function Vault() {
  return (
    <AuthShell>
      <Suspense>
        <VaultFlow />
      </Suspense>
    </AuthShell>
  );
}
