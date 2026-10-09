import { detectAndSaveTransactionRecurrence } from "@midday/db/queries";
import type { Job } from "bullmq";
import { z } from "zod";
import { getDb } from "../../utils/db";
import { BaseProcessor } from "../base";

/** Run one coalesced scan, allowing changes during this scan to queue a follow-up. */
export class DetectRecurrenceProcessor extends BaseProcessor<{
  teamId: string;
}> {
  /** Reject invalid team identifiers before starting a history scan. */
  protected getPayloadSchema() {
    return z.object({ teamId: z.string().uuid() });
  }

  /** Release pending-job deduplication before taking the database history snapshot. */
  async process(job: Job<{ teamId: string }>) {
    // Releasing at the start avoids losing enrichment that finishes after the
    // history snapshot. Completed job retention does not suppress later scans.
    await job.removeDeduplicationKey();
    return detectAndSaveTransactionRecurrence(getDb(), job.data);
  }
}
