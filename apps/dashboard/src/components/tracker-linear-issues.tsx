"use client";

import type { LinearIssueDetails } from "@midday/db/schema";
import { Button } from "@midday/ui/button";
import { Input } from "@midday/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/trpc/client";
import { TrackerLinearProject } from "./tracker-linear-project";

export function TrackerLinearIssues({
  projectId,
  value,
  onChange,
  disabled = false,
}: {
  projectId?: string | null;
  value: LinearIssueDetails[];
  onChange: (issues: LinearIssueDetails[]) => void;
  disabled?: boolean;
}) {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [after, setAfter] = useState<string>();
  const resolved = useRef("");
  const project = useQuery(
    trpc.trackerProjects.getById.queryOptions(
      { id: projectId! },
      { enabled: !!projectId },
    ),
  );
  const connection = useQuery(
    trpc.linear.connection.queryOptions(undefined, {
      enabled: !!projectId,
      retry: false,
      staleTime: 0,
      gcTime: 0,
    }),
  );
  const linked = project.data?.linearProject;
  const canSearch = !!linked && !!connection.data?.connected;
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setAfter(undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useQuery(
    trpc.linear.issues.queryOptions(
      { projectId: projectId!, query: search, after },
      {
        enabled: canSearch && !disabled,
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    ),
  );
  const refresh = useMutation(
    trpc.linear.refresh.mutationOptions({ onSuccess: onChange }),
  );
  useEffect(() => {
    const key = `${projectId}:${search}`;
    if (
      canSearch &&
      !disabled &&
      !refresh.isPending &&
      search &&
      search === query &&
      results.data?.exact &&
      !results.data.requiresChoice &&
      resolved.current !== key
    ) {
      resolved.current = key;
      const combined = [
        ...new Map(
          [...value, ...results.data.nodes].map((issue) => [issue.id, issue]),
        ).values(),
      ];
      if (combined.length <= 50) {
        onChange(combined);
        setQuery("");
      }
    }
  }, [
    results.data,
    projectId,
    search,
    query,
    value,
    onChange,
    disabled,
    refresh.isPending,
    canSearch,
  ]);
  const add = (issue: LinearIssueDetails) => {
    if (value.length < 50 && !value.some((item) => item.id === issue.id))
      onChange([...value, issue]);
  };
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Linear tickets · Internal only</h3>
        {value.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || refresh.isPending}
            onClick={() =>
              refresh.mutate({ issueIds: value.map((issue) => issue.id) })
            }
          >
            Refresh tickets
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Ticket details use your own Linear access. Links do not change invoice
        descriptions, tracked time, or billed amounts.
      </p>
      <ul className="space-y-1">
        {value.map((issue) => (
          <li
            key={issue.id}
            className="flex items-center justify-between gap-2 border px-3 py-2 text-sm"
          >
            <a
              href={issue.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 truncate"
              title={issue.title ?? undefined}
            >
              {issue.unavailable
                ? "Ticket unavailable with your Linear access"
                : `${issue.identifier} · ${issue.title}`}
              {issue.archivedAt ? " (archived)" : ""}
            </a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove ${issue.identifier ?? issue.id.slice(0, 8)}`}
              disabled={disabled || refresh.isPending}
              onClick={() =>
                onChange(value.filter((item) => item.id !== issue.id))
              }
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {linked && canSearch ? (
        <>
          <Input
            aria-label="Find or paste Linear tickets"
            placeholder="Paste IDs/URLs or search ticket titles"
            value={query}
            disabled={disabled || refresh.isPending}
            onChange={(event) => {
              resolved.current = "";
              setQuery(event.target.value);
            }}
          />
          {results.data?.requiresChoice && search && (
            <p className="text-xs">
              Choose the matching ticket below. Tickets outside the linked
              project need an explicit selection.
            </p>
          )}
          <div
            className="max-h-40 overflow-y-auto"
            aria-label="Linear ticket matches"
          >
            {results.data?.nodes
              .filter((issue) => !value.some((item) => item.id === issue.id))
              .map((issue) => (
                <button
                  type="button"
                  key={issue.id}
                  disabled={disabled || refresh.isPending || value.length >= 50}
                  className="block w-full p-2 text-left text-sm hover:bg-accent"
                  onClick={() => add(issue)}
                >
                  {issue.identifier} · {issue.title}
                  {issue.projectId !== linked.id && (
                    <span className="block text-xs text-muted-foreground">
                      Outside the linked project
                    </span>
                  )}
                </button>
              ))}
          </div>
          {results.isFetching && <p className="text-xs">Finding tickets…</p>}
          {results.data?.nodes.length === 0 && (
            <p className="text-xs">No matching tickets.</p>
          )}
          {results.data?.pageInfo.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={results.isFetching}
              onClick={() =>
                setAfter(results.data?.pageInfo.endCursor ?? undefined)
              }
            >
              More tickets
            </Button>
          )}
          {value.length >= 50 && (
            <p className="text-xs">Maximum 50 tickets per entry.</p>
          )}
        </>
      ) : !projectId ? (
        <p className="text-xs text-muted-foreground">
          Select a time-tracking project to add Linear tickets.
        </p>
      ) : project.isPending || connection.isPending ? (
        <p className="text-xs text-muted-foreground">Loading Linear setup…</p>
      ) : !project.isError && !connection.isError ? (
        <fieldset disabled={disabled} className="min-w-0">
          <TrackerLinearProject projectId={projectId} />
        </fieldset>
      ) : null}
      {(project.error || connection.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(project.error ?? connection.error)?.message}
        </p>
      )}
      {(results.error || refresh.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(results.error ?? refresh.error)?.message} Existing ticket links have
          been kept.
        </p>
      )}
    </section>
  );
}

// Editing links on an existing entry uses its own mutation, preserving financial fields.
export function TrackerEntryLinearIssues({
  entryId,
  projectId,
}: {
  entryId: string;
  projectId?: string | null;
}) {
  const trpc = useTRPC();
  const cache = useQueryClient();
  const entries = useQuery(
    trpc.linear.entryIssues.queryOptions(
      { entryId },
      { staleTime: 0, gcTime: 0 },
    ),
  );
  const update = useMutation(
    trpc.linear.setEntryIssues.mutationOptions({
      onSuccess: (issues) => {
        cache.setQueryData(
          trpc.linear.entryIssues.queryKey({ entryId }),
          issues,
        );
        cache.invalidateQueries({
          queryKey: trpc.trackerEntries.getTimerStatus.queryKey(),
        });
        cache.invalidateQueries({
          queryKey: trpc.trackerEntries.byDate.queryKey(),
        });
        cache.invalidateQueries({
          queryKey: trpc.trackerEntries.byRange.queryKey(),
        });
      },
    }),
  );
  return (
    <>
      <p className="text-xs text-muted-foreground">
        Ticket changes save immediately.
      </p>
      <TrackerLinearIssues
        projectId={projectId}
        value={entries.data ?? []}
        disabled={entries.isPending || entries.isError || update.isPending}
        onChange={(issues) =>
          update.mutate({ entryId, issueIds: issues.map((issue) => issue.id) })
        }
      />
      {(entries.error ?? update.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(entries.error ?? update.error)?.message}
        </p>
      )}
    </>
  );
}
