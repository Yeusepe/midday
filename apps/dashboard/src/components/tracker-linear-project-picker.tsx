"use client";

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
import { useEffect, useState } from "react";
import { useTRPC } from "@/trpc/client";

export function TrackerLinearProjectPicker({
  projectId,
  workspaceName,
  disabled = false,
}: {
  projectId: string;
  workspaceName?: string;
  disabled?: boolean;
}) {
  const trpc = useTRPC();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [after, setAfter] = useState<string>();

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setAfter(undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const projects = useQuery(
    trpc.linear.projects.queryOptions(
      { query: search, after },
      { enabled: open && !disabled, retry: false, staleTime: 0, gcTime: 0 },
    ),
  );
  const link = useMutation(
    trpc.linear.linkProject.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          cache.invalidateQueries({
            queryKey: trpc.trackerProjects.getById.queryKey({ id: projectId }),
          }),
          cache.invalidateQueries({
            queryKey: trpc.trackerProjects.get.infiniteQueryKey(),
          }),
          cache.invalidateQueries({ queryKey: trpc.linear.pathKey() }),
        ]);
        setOpen(false);
      },
    }),
  );
  const loading = projects.isFetching || search !== query;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full justify-start gap-2 px-3 text-sm font-normal"
          disabled={disabled || link.isPending}
        >
          <Icons.Folder className="size-4 text-muted-foreground" />
          {link.isPending ? "Linking project…" : "Choose Linear project"}
          <Icons.ChevronDown className="ml-auto size-4 text-muted-foreground" />
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
              aria-label="Find a Linear project"
              placeholder="Search Linear projects…"
              value={query}
              onValueChange={setQuery}
              disabled={link.isPending}
            />
          </div>
          <CommandList className="max-h-56">
            {loading ? (
              <p
                role="status"
                className="px-3 py-6 text-center text-xs text-muted-foreground"
              >
                Finding projects…
              </p>
            ) : projects.error ? (
              <p role="alert" className="px-3 py-4 text-xs text-destructive">
                {projects.error.message}
              </p>
            ) : projects.data?.nodes.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No projects found.
              </p>
            ) : (
              <CommandGroup heading={workspaceName}>
                {projects.data?.nodes.map((project) => (
                  <CommandItem
                    key={project.id}
                    value={project.id}
                    disabled={disabled || link.isPending}
                    onSelect={() =>
                      link.mutate({ projectId, linearProjectId: project.id })
                    }
                    className="gap-2 py-2.5"
                  >
                    <Icons.Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate" title={project.name}>
                      {project.name}
                    </span>
                  </CommandItem>
                ))}
                {projects.data?.pageInfo.hasNextPage && (
                  <CommandItem
                    value="load-more-projects"
                    disabled={link.isPending}
                    onSelect={() =>
                      setAfter(projects.data.pageInfo.endCursor ?? undefined)
                    }
                    className="justify-center text-xs text-muted-foreground"
                  >
                    More projects
                  </CommandItem>
                )}
              </CommandGroup>
            )}
          </CommandList>
          {link.error && (
            <p role="alert" className="px-3 py-2 text-xs text-destructive">
              {link.error.message}
            </p>
          )}
          <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
            Applies to all time entries in this project.
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
