"use client";

import { Button } from "@midday/ui/button";
import { Input } from "@midday/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/trpc/client";

export function TrackerLinearProject({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [after, setAfter] = useState<string>();
  const connection = useQuery(
    trpc.linear.connection.queryOptions(undefined, { staleTime: 0, gcTime: 0 }),
  );
  const project = useQuery(
    trpc.trackerProjects.getById.queryOptions({ id: projectId }),
  );
  const [search, setSearch] = useState("");
  const results = useQuery(
    trpc.linear.projects.queryOptions(
      { query: search, after },
      { enabled: !!connection.data?.connected, staleTime: 0, gcTime: 0 },
    ),
  );
  const connect = useMutation(
    trpc.linear.connect.mutationOptions({
      onSuccess: ({ url }) => {
        window.location.href = url;
      },
    }),
  );
  const link = useMutation(
    trpc.linear.linkProject.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.trackerProjects.getById.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.trackerProjects.get.infiniteQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.linear.pathKey(),
        });
      },
    }),
  );
  const disconnect = useMutation(
    trpc.linear.disconnect.mutationOptions({
      onSettled: async () => {
        await queryClient.cancelQueries({ queryKey: trpc.linear.pathKey() });
        queryClient.removeQueries({
          queryKey: trpc.linear.pathKey(),
          predicate: (query) =>
            JSON.stringify(query.queryKey) !==
            JSON.stringify(trpc.linear.connection.queryKey()),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.linear.connection.queryKey(),
        });
      },
    }),
  );
  const linked = project.data?.linearProject;
  const details = useQuery(
    trpc.linear.project.queryOptions(
      { projectId },
      {
        enabled: !!linked && !!connection.data?.connected,
        staleTime: 0,
        gcTime: 0,
      },
    ),
  );
  const error =
    link.error ??
    connect.error ??
    disconnect.error ??
    results.error ??
    connection.error;

  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-medium">Linear project</h3>
      <p className="text-xs text-muted-foreground">
        Choose a Linear project to enable ticket search for this project's time
        entries. This selection saves immediately and is shared with your
        Payments team. Ticket details use each viewer's own Linear access.
      </p>
      {linked && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <a
            href={details.data?.url}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {details.data?.name ?? "Linked Linear project"}
          </a>
          <Button
            type="button"
            variant="ghost"
            disabled={link.isPending}
            onClick={() => link.mutate({ projectId, linearProjectId: null })}
          >
            Unlink project
          </Button>
        </div>
      )}
      {connection.data?.connected ? (
        <>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span>{connection.data.organization?.name}</span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
            >
              Reconnect
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              Disconnect your Linear account
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              aria-label="Find a Linear project"
              placeholder="Find a Linear project"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearch(query);
                setAfter(undefined);
              }}
            >
              Search
            </Button>
          </div>
          <div
            className="max-h-48 overflow-y-auto space-y-1"
            aria-label="Linear project matches"
          >
            {results.data?.nodes.map((item) => (
              <button
                type="button"
                key={item.id}
                disabled={link.isPending}
                className="block w-full border p-2 text-left text-sm hover:bg-accent"
                onClick={() =>
                  link.mutate({ projectId, linearProjectId: item.id })
                }
              >
                <span>
                  {item.name}
                  {linked?.id === item.id ? " (linked)" : ""}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.url}
                </span>
              </button>
            ))}
            {results.isFetching && <p className="text-xs">Loading projects…</p>}
            {results.data?.nodes.length === 0 && (
              <p className="text-xs">No projects found.</p>
            )}
          </div>
          {results.data?.pageInfo.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setAfter(results.data?.pageInfo.endCursor ?? undefined)
              }
            >
              More projects
            </Button>
          )}
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={
            !connection.data?.configured ||
            connect.isPending ||
            connection.data?.revocationPending
          }
          onClick={() => connect.mutate()}
        >
          Connect your Linear account
        </Button>
      )}
      {connection.data?.revocationPending && (
        <div className="space-y-2 text-sm">
          <p>
            Access is disabled in Payments. Retry to finish revoking access at
            Linear.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            Retry disconnect
          </Button>
        </div>
      )}
      {connection.data && !connection.data.configured && (
        <p className="text-xs text-muted-foreground">
          Linear OAuth needs to be configured on the server before connecting.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
    </section>
  );
}
