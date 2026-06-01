"use client";

import { LogEvents } from "@midday/events/events";
import { Button } from "@midday/ui/button";
import { Icons } from "@midday/ui/icons";
import { Textarea } from "@midday/ui/textarea";
import { useToast } from "@midday/ui/use-toast";
import NumberFlow from "@number-flow/react";
import { useOpenPanel } from "@openpanel/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useGlobalTimerStatus } from "@/hooks/use-global-timer-status";
import { useTimerStore } from "@/store/timer";
import { useTRPC } from "@/trpc/client";
import { secondsToHoursAndMinutes } from "@/utils/format";
import { TrackerSelectProject } from "./tracker-select-project";

type ProjectOption = {
  id: string;
  name: string;
};

const DRAFT_PREFIX = "midday.tracker.stopwatch.";

function getDraftKey(entryId: string) {
  return `${DRAFT_PREFIX}${entryId}`;
}

function formatStopwatchTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return { hours, minutes, seconds: secs };
}

export function TrackerStopwatch() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { track } = useOpenPanel();
  const setTimerStatus = useTimerStore((state) => state.setTimerStatus);
  const { isRunning, elapsedTime, currentProject, projectId } =
    useGlobalTimerStatus();

  const [selectedProject, setSelectedProject] = useState<
    ProjectOption | undefined
  >();
  const [notes, setNotes] = useState("");

  const { data: timerStatus } = useQuery({
    ...trpc.trackerEntries.getTimerStatus.queryOptions(),
    refetchInterval: (query) => (query.state.data?.isRunning ? 60000 : false),
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  const runningEntry = timerStatus?.currentEntry;
  const runningEntryId = runningEntry?.id;
  const runningProjectName =
    runningEntry?.trackerProject?.name ?? currentProject ?? null;
  const activeProjectId = runningEntry?.projectId ?? projectId;

  const displayedTime = useMemo(
    () => formatStopwatchTime(isRunning ? elapsedTime : 0),
    [isRunning, elapsedTime],
  );

  useEffect(() => {
    if (!runningEntryId) {
      return;
    }

    const savedDraft = window.localStorage.getItem(getDraftKey(runningEntryId));
    setNotes(savedDraft ?? runningEntry?.description ?? "");
  }, [runningEntryId, runningEntry?.description]);

  useEffect(() => {
    if (!runningEntryId) {
      return;
    }

    window.localStorage.setItem(getDraftKey(runningEntryId), notes);
  }, [runningEntryId, notes]);

  const startTimerMutation = useMutation(
    trpc.trackerEntries.startTimer.mutationOptions({
      onMutate: async (variables) => {
        await queryClient.cancelQueries({
          queryKey: trpc.trackerEntries.getTimerStatus.queryKey(),
        });

        queryClient.setQueryData(
          trpc.trackerEntries.getTimerStatus.queryKey(),
          (old: any) => ({
            ...old,
            isRunning: true,
            currentEntry: {
              ...old?.currentEntry,
              projectId: variables.projectId,
              description: variables.description ?? null,
              trackerProject: {
                ...old?.currentEntry?.trackerProject,
                id: variables.projectId,
                name: selectedProject?.name ?? "Project",
              },
            },
            elapsedTime: 0,
          }),
        );

        setTimerStatus({
          isRunning: true,
          elapsedTime: 0,
          projectName: selectedProject?.name ?? null,
          projectId: variables.projectId,
        });
      },
      onSuccess: (data) => {
        if (data?.id) {
          window.localStorage.setItem(getDraftKey(data.id), notes);
        }

        queryClient.invalidateQueries({
          queryKey: trpc.trackerEntries.getTimerStatus.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.trackerEntries.getCurrentTimer.queryKey(),
        });
      },
      onError: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.trackerEntries.getTimerStatus.queryKey(),
        });
        toast({
          duration: 3500,
          variant: "error",
          title: "Something went wrong please try again.",
        });
      },
    }),
  );

  const stopTimerMutation = useMutation(
    trpc.trackerEntries.stopTimer.mutationOptions({
      onMutate: async () => {
        await queryClient.cancelQueries({
          queryKey: trpc.trackerEntries.getTimerStatus.queryKey(),
        });

        const currentElapsedTime = elapsedTime;
        const currentProjectName = runningProjectName;

        queryClient.setQueryData(
          trpc.trackerEntries.getTimerStatus.queryKey(),
          (old: any) => ({
            ...old,
            isRunning: false,
            currentEntry: null,
            elapsedTime: 0,
          }),
        );

        setTimerStatus({
          isRunning: false,
          elapsedTime: 0,
          projectName: null,
          projectId: null,
        });

        return { currentElapsedTime, currentProjectName, runningEntryId };
      },
      onSuccess: (data, _, context) => {
        if (context?.runningEntryId) {
          window.localStorage.removeItem(getDraftKey(context.runningEntryId));
        }

        queryClient.invalidateQueries({
          queryKey: trpc.trackerEntries.getTimerStatus.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.trackerEntries.getCurrentTimer.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.trackerEntries.byDate.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.trackerEntries.byRange.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.trackerProjects.get.infiniteQueryKey(),
        });

        if (data?.discarded) {
          toast({
            title: "Timer discarded",
            description: "Entry was under 1 minute and was not saved",
          });
        } else {
          toast({
            title: "Timer stopped",
            description: `${secondsToHoursAndMinutes(context?.currentElapsedTime ?? 0)} added to ${context?.currentProjectName ?? "project"}`,
            variant: "success",
          });
        }

        setNotes("");
      },
      onError: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.trackerEntries.getTimerStatus.queryKey(),
        });
        toast({
          duration: 3500,
          variant: "error",
          title: "Something went wrong please try again.",
        });
      },
    }),
  );

  const handleStart = () => {
    if (timerStatus?.isRunning) {
      const currentProjectName =
        timerStatus.currentEntry?.trackerProject?.name || "Unknown Project";

      toast({
        title: "Timer already running",
        description: `You have a timer running for "${currentProjectName}". Please stop it first before starting a new timer.`,
      });
      return;
    }

    if (!selectedProject?.id) {
      return;
    }

    track(LogEvents.TrackerStarted.name, { projectId: selectedProject.id });
    startTimerMutation.mutate({
      projectId: selectedProject.id,
      description: notes.trim() || null,
    });
  };

  const handleStop = () => {
    track(LogEvents.TrackerStopped.name, { projectId: activeProjectId });
    stopTimerMutation.mutate({
      entryId: runningEntryId,
      description: notes.trim() || null,
    });
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-[720px] flex-col justify-center py-8">
      <div className="mb-10">
        <div className="mb-3 flex items-center gap-2 text-sm text-[#666]">
          <Icons.Tracker size={18} />
          <span>Stopwatch</span>
        </div>

        <div className="flex items-baseline font-serif text-6xl md:text-8xl">
          <NumberFlow
            value={displayedTime.hours}
            format={{ minimumIntegerDigits: 2 }}
          />
          <span className="px-1 text-muted-foreground">:</span>
          <NumberFlow
            value={displayedTime.minutes}
            format={{ minimumIntegerDigits: 2 }}
          />
          <span className="px-1 text-muted-foreground">:</span>
          <NumberFlow
            value={displayedTime.seconds}
            format={{ minimumIntegerDigits: 2 }}
          />
        </div>

        <div className="mt-4 h-6 text-sm text-[#666]">
          {isRunning && runningProjectName ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-[6px] w-[6px]">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00C969] opacity-75" />
                <span className="relative inline-flex h-[6px] w-[6px] rounded-full bg-[#00C969]" />
              </span>
              <span>{runningProjectName}</span>
            </div>
          ) : (
            <span>Select a project to start tracking time.</span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {isRunning ? (
          <div className="border border-border bg-[#f7f7f7] px-4 py-3 text-sm dark:bg-[#131313]">
            <div className="text-xs text-muted-foreground">Project</div>
            <div className="mt-1 font-medium">{runningProjectName}</div>
          </div>
        ) : (
          <TrackerSelectProject
            selectedId={selectedProject?.id}
            onSelect={(project) => {
              if (project) {
                setSelectedProject(project);
              }
            }}
            onCreate={(project) => setSelectedProject(project)}
          />
        )}

        <Textarea
          value={notes}
          placeholder="Notes on what was done"
          rows={5}
          onChange={(event) => setNotes(event.target.value)}
        />

        <Button
          className="h-12 w-full gap-2"
          disabled={
            startTimerMutation.isPending ||
            stopTimerMutation.isPending ||
            (!isRunning && !selectedProject?.id)
          }
          onClick={isRunning ? handleStop : handleStart}
        >
          {isRunning ? (
            <>
              <Icons.StopOutline size={20} />
              Stop timer
            </>
          ) : (
            <>
              <Icons.PlayOutline size={20} />
              Start timer
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
