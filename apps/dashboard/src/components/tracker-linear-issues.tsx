"use client";

import type { LinearIssueDetails } from "@midday/db/schema";
import { Button } from "@midday/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@midday/ui/command";
import { Icons } from "@midday/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@midday/ui/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useTRPC } from "@/trpc/client";
import { TrackerLinearProjectPicker } from "./tracker-linear-project-picker";

export function TrackerLinearIssues({
  projectId,
  value,
  onChange,
  disabled = false,
  saveStatus,
}: {
  projectId?: string | null;
  value: LinearIssueDetails[];
  onChange: (issues: LinearIssueDetails[]) => void;
  disabled?: boolean;
  saveStatus?: "saving" | "saved";
}) {
  const trpc = useTRPC();
  const labelId = useId();
  const [open, setOpen] = useState(false);
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
        enabled: open && canSearch,
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    ),
  );
  const refresh = useMutation(
    trpc.linear.refresh.mutationOptions({ onSuccess: onChange }),
  );
  const connect = useMutation(
    trpc.linear.connect.mutationOptions({
      onSuccess: ({ url }) => {
        window.location.href = url;
      },
    }),
  );
  useEffect(() => {
    const key = `${projectId}:${search}`;
    if (
      open &&
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
    open,
  ]);
  const add = (issue: LinearIssueDetails) => {
    if (value.length < 50 && !value.some((item) => item.id === issue.id)) {
      onChange([...value, issue]);
      setQuery("");
    }
  };
  const busy = disabled || refresh.isPending;
  const loading = results.isFetching || search !== query;
  const error =
    project.error ?? connection.error ?? connect.error ?? refresh.error;

  return (
    <section aria-labelledby={labelId} className="min-w-0 space-y-2">
      <div className="flex min-h-6 items-center gap-2">
        <h3 id={labelId} className="text-sm font-medium">
          Tickets
        </h3>
        <span
          className="text-[11px] text-muted-foreground"
          title="Ticket details stay off invoices"
        >
          Internal
        </span>
        <div className="ml-auto flex items-center gap-1">
          {saveStatus && (
            <span role="status" className="text-[11px] text-muted-foreground">
              {saveStatus === "saving" ? "Saving…" : "Saved"}
            </span>
          )}
          {value.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              className="size-6 p-0 text-muted-foreground"
              aria-label="Refresh ticket details"
              title="Refresh ticket details"
              disabled={busy}
              onClick={() =>
                refresh.mutate({ issueIds: value.map((issue) => issue.id) })
              }
            >
              <Icons.Refresh className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      {value.length > 0 && (
        <ul aria-label="Attached tickets" className="flex flex-wrap gap-1.5">
          {value.map((issue) => (
            <li
              key={issue.id}
              className="inline-flex max-w-full items-center gap-1 border bg-muted/40 pl-2 text-xs"
            >
              <a
                href={issue.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 py-1.5 hover:underline"
                title={issue.title ?? undefined}
              >
                {issue.unavailable ? (
                  <span className="text-muted-foreground">
                    Unavailable ticket
                  </span>
                ) : (
                  <>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {issue.identifier}
                    </span>
                    <span className="max-w-48 truncate">{issue.title}</span>
                    {issue.archivedAt && (
                      <span className="text-muted-foreground">Archived</span>
                    )}
                  </>
                )}
              </a>
              <Button
                type="button"
                variant="ghost"
                className="size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${issue.identifier ?? issue.id.slice(0, 8)}`}
                disabled={busy}
                onClick={() =>
                  onChange(value.filter((item) => item.id !== issue.id))
                }
              >
                <Icons.Close className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {linked && canSearch ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full justify-start gap-2 px-3 text-sm font-normal"
              disabled={busy || value.length >= 50}
            >
              <Icons.Add className="size-4 text-muted-foreground" />
              {value.length >= 50 ? "50 tickets attached" : "Add tickets"}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            collisionPadding={16}
            className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
          >
            <Command shouldFilter={false}>
              <div className="border-b px-3">
                <CommandInput
                  aria-label="Find or paste Linear tickets"
                  placeholder="Search tickets or paste a link…"
                  value={query}
                  disabled={refresh.isPending}
                  onValueChange={(text) => {
                    resolved.current = "";
                    setQuery(text);
                  }}
                />
              </div>
              <CommandList
                className="max-h-56"
                aria-label="Linear ticket matches"
              >
                {loading ? (
                  <p
                    role="status"
                    className="px-3 py-6 text-center text-xs text-muted-foreground"
                  >
                    Finding tickets…
                  </p>
                ) : results.error ? (
                  <p
                    role="alert"
                    className="px-3 py-4 text-xs text-destructive"
                  >
                    {results.error.message}
                  </p>
                ) : results.data?.nodes.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No matching tickets.
                  </p>
                ) : (
                  <CommandGroup
                    heading={search ? "Matches" : "Project tickets"}
                  >
                    {results.data?.nodes.map((issue) => {
                      const attached = value.some(
                        (item) => item.id === issue.id,
                      );
                      return (
                        <CommandItem
                          key={issue.id}
                          value={issue.id}
                          disabled={busy || attached || value.length >= 50}
                          className="gap-2 py-2.5"
                          onSelect={() => add(issue)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {issue.identifier}
                              </span>
                              {issue.projectId !== linked.id && (
                                <span className="text-[10px] text-muted-foreground">
                                  Other project
                                </span>
                              )}
                            </div>
                            <span
                              className="block truncate"
                              title={issue.title ?? undefined}
                            >
                              {issue.title}
                            </span>
                          </div>
                          {attached && (
                            <Icons.Check className="size-4 shrink-0 text-muted-foreground" />
                          )}
                        </CommandItem>
                      );
                    })}
                    {results.data?.pageInfo.hasNextPage && (
                      <CommandItem
                        value="load-more-tickets"
                        disabled={busy}
                        onSelect={() =>
                          setAfter(results.data.pageInfo.endCursor ?? undefined)
                        }
                        className="justify-center text-xs text-muted-foreground"
                      >
                        More tickets
                      </CommandItem>
                    )}
                  </CommandGroup>
                )}
              </CommandList>
              <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
                <span>
                  {value.length
                    ? `${value.length} attached`
                    : "Select tickets to attach"}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-foreground hover:underline"
                >
                  Done
                </button>
              </div>
            </Command>
          </PopoverContent>
        </Popover>
      ) : !projectId ? (
        <p className="text-xs text-muted-foreground">
          Choose a tracking project first.
        </p>
      ) : project.isPending || connection.isPending ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading…
        </p>
      ) : !project.isError && !connection.isError ? (
        connection.data?.connected ? (
          <TrackerLinearProjectPicker
            projectId={projectId}
            workspaceName={connection.data.organization?.name}
            disabled={busy}
          />
        ) : (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full justify-start gap-2 px-3 text-sm font-normal"
              disabled={
                busy ||
                connect.isPending ||
                !connection.data?.configured ||
                connection.data?.revocationPending
              }
              onClick={() => connect.mutate()}
            >
              <Icons.AddLink className="size-4 text-muted-foreground" />
              {connect.isPending ? "Connecting…" : "Connect Linear"}
            </Button>
            {connection.data?.revocationPending && (
              <p className="text-xs text-muted-foreground">
                Finish disconnecting in project settings to reconnect.
              </p>
            )}
          </div>
        )
      ) : null}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
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
      <TrackerLinearIssues
        projectId={projectId}
        value={entries.data ?? []}
        disabled={entries.isPending || entries.isError || update.isPending}
        saveStatus={
          update.isPending ? "saving" : update.isSuccess ? "saved" : undefined
        }
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
