import { Suspense } from "react";
import { LinearOAuthCallback } from "@/components/linear-oauth-callback";

export default function Page() {
  return (
    <Suspense fallback={<p>Connecting Linear…</p>}>
      <LinearOAuthCallback />
    </Suspense>
  );
}
