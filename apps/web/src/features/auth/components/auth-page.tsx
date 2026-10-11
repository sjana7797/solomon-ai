import { Suspense } from "react";

import { AuthForm } from "./auth-form";
import { AuthShell } from "./auth-shell";

export function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <AuthShell>
      <Suspense>
        <AuthForm mode={mode} />
      </Suspense>
    </AuthShell>
  );
}
