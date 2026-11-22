"use client";
import { Button } from "@midday/ui/button";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useTRPC } from "@/trpc/client";

export function LinearOAuthCallback() {
  const trpc = useTRPC();
  const params = useSearchParams();
  const router = useRouter();
  const started = useRef(false);
  const complete = useMutation(
    trpc.linear.complete.mutationOptions({
      onSuccess: () => router.replace("/tracker"),
    }),
  );
  const code = params.get("code");
  const state = params.get("state");
  useEffect(() => {
    if (started.current || !code || !state || params.get("error")) return;
    started.current = true;
    complete.mutate({ code, state });
  }, [code, state, params, complete]);
  return (
    <div className="mx-auto max-w-lg space-y-4 py-16">
      <h1 className="text-xl">Connect Linear</h1>
      <p>
        {params.get("error")
          ? "Linear authorization was cancelled."
          : (complete.error?.message ??
            (!code || !state
              ? "Missing Linear authorization details."
              : "Finishing your Linear connection…"))}
      </p>
      {complete.isError && code && state && (
        <Button onClick={() => complete.mutate({ code, state })}>Retry</Button>
      )}
      <Link className="block underline" href="/tracker">
        Return to time tracker
      </Link>
    </div>
  );
}
