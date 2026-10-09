import { triggerJob } from "@midday/job-client";
import { logger } from "@midday/logger";

/** A queue failure must not make callers retry an already committed insert. */
export async function enqueueTransactionEnrichment(
  teamId: string,
  transactions: Array<{ id: string }>,
) {
  if (transactions.length === 0) return;

  try {
    await triggerJob(
      "enrich-transactions",
      {
        teamId,
        transactionIds: transactions.map((transaction) => transaction.id),
      },
      "transactions",
    );
  } catch (error) {
    logger.error("Failed to enqueue transaction enrichment after creation", {
      teamId,
      transactionIds: transactions.map((transaction) => transaction.id),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
