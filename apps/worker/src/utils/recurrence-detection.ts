import { getQueue } from "@midday/job-client";

/** Collapse enrichment bursts into one delayed scan per team. */
export async function enqueueRecurrenceDetection(
  teamId: string,
  queue = getQueue("transactions"),
) {
  return queue.add(
    "detect-transaction-recurrence",
    { teamId },
    {
      delay: 30_000,
      deduplication: { id: `transaction-recurrence-${teamId}` },
    },
  );
}
