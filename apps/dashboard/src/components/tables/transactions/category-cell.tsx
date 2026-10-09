"use client";

import { Spinner } from "@midday/ui/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ComponentProps, useEffect, useState } from "react";
import { InlineSelectCategory } from "@/components/inline-select-category";
import { useTRPC } from "@/trpc/client";

const ANALYSIS_WAIT_MS = 10 * 60_000;

type Props = ComponentProps<typeof InlineSelectCategory> & {
  id: string;
  createdAt: string;
  enrichmentCompleted: boolean | null;
};

export function TransactionCategoryCell({
  id,
  createdAt,
  enrichmentCompleted,
  ...categoryProps
}: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [startedAt, setStartedAt] = useState(() => Date.parse(createdAt));
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    const remaining = startedAt + ANALYSIS_WAIT_MS - Date.now();
    setWaiting(!enrichmentCompleted && remaining > 0);
    if (enrichmentCompleted || !(remaining > 0)) return;
    const timer = setTimeout(() => setWaiting(false), remaining);
    return () => clearTimeout(timer);
  }, [startedAt, enrichmentCompleted]);

  const retry = useMutation(
    trpc.transactions.retryEnrichment.mutationOptions({
      onSuccess: ({ queued }) => {
        if (queued) setStartedAt(Date.now());
        queryClient.invalidateQueries({
          queryKey: trpc.transactions.get.infiniteQueryKey(),
        });
      },
    }),
  );

  return (
    <div className="flex flex-col gap-1">
      <InlineSelectCategory {...categoryProps} />
      {!enrichmentCompleted && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {waiting ? (
            <>
              <Spinner size={12} /> <span>Analyzing</span>
            </>
          ) : (
            <>
              <span>Analysis delayed</span>
              <button
                type="button"
                className="underline"
                disabled={retry.isPending}
                onClick={(event) => {
                  event.stopPropagation();
                  retry.mutate({ id });
                }}
              >
                {retry.isPending ? "Retrying…" : "Retry"}
              </button>
            </>
          )}
        </div>
      )}
      {retry.isError && (
        <span role="alert" className="text-xs text-destructive">
          Could not restart analysis. Try again.
        </span>
      )}
    </div>
  );
}
