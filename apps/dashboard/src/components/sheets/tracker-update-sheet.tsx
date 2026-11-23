"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@midday/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@midday/ui/dropdown-menu";
import { Icons } from "@midday/ui/icons";
import { Sheet, SheetContent, SheetHeader } from "@midday/ui/sheet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TrackerProjectForm } from "@/components/forms/tracker-project-form";
import { useLatestProjectId } from "@/hooks/use-latest-project-id";
import { useTeamQuery } from "@/hooks/use-team";
import { useTrackerParams } from "@/hooks/use-tracker-params";
import { useTRPC } from "@/trpc/client";

export function TrackerUpdateSheet() {
  const { data: team } = useTeamQuery();
  const defaultCurrency = team?.baseCurrency || "USD";
  const { setParams, update, projectId } = useTrackerParams();
  const { latestProjectId, setLatestProjectId } = useLatestProjectId(team?.id);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const isOpen = update !== null && Boolean(projectId);

  const { data, isPending, error } = useQuery(
    trpc.trackerProjects.getById.queryOptions(
      { id: projectId! },
      {
        enabled: isOpen,
        staleTime: 30 * 1000, // 30 seconds - prevents excessive refetches when reopening
      },
    ),
  );

  const deleteTrackerProjectMutation = useMutation(
    trpc.trackerProjects.delete.mutationOptions({
      onSuccess: (result) => {
        if (result && result.id === latestProjectId) {
          setLatestProjectId(null);
        }

        setParams({ projectId: null, update: null });

        queryClient.invalidateQueries({
          queryKey: trpc.trackerProjects.get.infiniteQueryKey(),
        });
      },
    }),
  );

  return (
    <AlertDialog>
      <Sheet
        open={isOpen}
        onOpenChange={() => setParams({ update: null, projectId: null })}
      >
        <SheetContent title="Edit Project" className="flex flex-col">
          <SheetHeader className="mb-8 flex shrink-0 justify-between items-center flex-row">
            <h2 className="text-xl">Edit Project</h2>

            <DropdownMenu>
              <DropdownMenuTrigger>
                <Icons.MoreVertical className="w-5 h-5" />
              </DropdownMenuTrigger>

              <DropdownMenuContent className="w-42" sideOffset={10} align="end">
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem className="text-destructive">
                    Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
              </DropdownMenuContent>
            </DropdownMenu>
          </SheetHeader>

          {data ? (
            <TrackerProjectForm
              key={data.id}
              data={data}
              defaultCurrency={defaultCurrency}
            />
          ) : (
            <p
              role={error ? "alert" : "status"}
              className="text-sm text-muted-foreground"
            >
              {error
                ? "Could not load project. Please reopen it to try again."
                : isPending
                  ? "Loading project…"
                  : "Project not found."}
            </p>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete this
            project.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              deleteTrackerProjectMutation.mutate({ id: projectId! })
            }
          >
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
