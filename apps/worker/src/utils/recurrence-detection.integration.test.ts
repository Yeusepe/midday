import { afterAll, describe, expect, mock, test } from "bun:test";
import { Queue, QueueEvents, Worker } from "bullmq";
import { enqueueRecurrenceDetection } from "./recurrence-detection";

const url = process.env.RECURRENCE_TEST_REDIS_URL;
const suite = url ? describe : describe.skip;

suite("recurrence scan coalescing", () => {
  const connection = { url, maxRetriesPerRequest: null };
  const queue = new Queue(`recurrence-test-${crypto.randomUUID()}`, {
    connection,
    defaultJobOptions: { attempts: 2 },
  });
  const events = new QueueEvents(queue.name, { connection });
  let worker: Worker | undefined;

  afterAll(async () => {
    await worker?.close();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
    mock.restore();
  });

  test("collapses bursts, keeps a follow-up during an active scan, and permits later scans", async () => {
    let release!: () => void;
    let started!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const active = new Promise<void>((resolve) => {
      started = resolve;
    });
    const detect = mock(async () => {
      started();
      await hold;
      return { detected: 3, ruleMatches: 0 };
    });
    mock.module("@midday/db/queries", () => ({
      detectAndSaveTransactionRecurrence: detect,
    }));
    mock.module("./db", () => ({ getDb: () => ({}) }));
    const { DetectRecurrenceProcessor } = await import(
      "../processors/transactions/detect-recurrence"
    );
    const processor = new DetectRecurrenceProcessor();
    await events.waitUntilReady();
    const teamId = crypto.randomUUID();
    const jobs = await Promise.all(
      Array.from({ length: 10 }, () =>
        enqueueRecurrenceDetection(teamId, queue),
      ),
    );
    expect(new Set(jobs.map((job) => job.id)).size).toBe(1);
    expect(await queue.getDelayedCount()).toBe(1);
    worker = new Worker(queue.name, (job) => processor.process(job), {
      connection,
      concurrency: 1,
    });
    const first = jobs[0]!;
    await first.promote();
    await active;
    try {
      const followUps = await Promise.all(
        Array.from({ length: 10 }, () =>
          enqueueRecurrenceDetection(teamId, queue),
        ),
      );
      expect(new Set(followUps.map((job) => job.id)).size).toBe(1);
      expect(followUps[0]!.id).not.toBe(first.id);
      const otherTeam = await enqueueRecurrenceDetection(
        crypto.randomUUID(),
        queue,
      );
      expect(otherTeam.id).not.toBe(followUps[0]!.id);
      await otherTeam.remove();
      release();
      await first.waitUntilFinished(events, 5000);
      await followUps[0]!.promote();
      await followUps[0]!.waitUntilFinished(events, 5000);
      // Completed jobs are retained, but their deduplication keys must be gone.
      expect(await first.getState()).toBe("completed");
      const later = await enqueueRecurrenceDetection(teamId, queue);
      expect(later.id).not.toBe(first.id);
      await later.promote();
      await later.waitUntilFinished(events, 5000);
      expect(detect).toHaveBeenCalledTimes(3);
    } finally {
      release();
    }
  }, 15000);
});
