import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { transactions } from "../schema";
import { applyTransactionRecurrenceRules } from "./transaction-recurrence";

export type GetTransactionsForEnrichmentParams = {
  transactionIds: string[];
  teamId: string;
};

/** Recover pending rows when a CSV import is retried after its enqueue step failed. */
export async function getPendingImportedTransactionIds(
  db: Database,
  params: { teamId: string; internalIds: string[] },
) {
  if (!params.internalIds.length) return [];
  return db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.teamId, params.teamId),
        inArray(transactions.internalId, params.internalIds),
        or(
          eq(transactions.enrichmentCompleted, false),
          isNull(transactions.enrichmentCompleted),
        ),
      ),
    );
}

export type TransactionForEnrichment = {
  id: string;
  name: string;
  counterpartyName: string | null;
  merchantName: string | null;
  description: string | null;
  amount: number;
  currency: string;
  categorySlug: string | null;
};

export type EnrichmentUpdateData = {
  merchantName?: string;
  categorySlug?: string;
};

export type UpdateTransactionEnrichmentParams = {
  transactionId: string;
  data: EnrichmentUpdateData;
};

/**
 * Get transactions that need enrichment (no merchantName yet)
 */
export async function getTransactionsForEnrichment(
  db: Database,
  params: GetTransactionsForEnrichmentParams,
): Promise<TransactionForEnrichment[]> {
  if (params.transactionIds.length === 0) {
    return [];
  }

  return db
    .select({
      id: transactions.id,
      name: transactions.name,
      counterpartyName: transactions.counterpartyName,
      merchantName: transactions.merchantName,
      description: transactions.description,
      amount: transactions.amount,
      currency: transactions.currency,
      categorySlug: transactions.categorySlug,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.teamId, params.teamId),
        inArray(transactions.id, params.transactionIds),
        or(
          eq(transactions.enrichmentCompleted, false),
          isNull(transactions.enrichmentCompleted),
        ),
      ),
    );
}

/**
 * Update multiple transactions with enrichment data using individual updates
 *
 * @param db - Database connection
 * @param updates - Array of updates to apply (max 1000 for safety)
 * @throws Error if batch size exceeds limit or if updates fail
 */
export async function updateTransactionEnrichments(
  db: Database,
  updates: UpdateTransactionEnrichmentParams[],
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  // Safety: Limit batch size to prevent query size issues
  if (updates.length > 1000) {
    throw new Error(
      `Batch size too large: ${updates.length}. Maximum allowed: 1000`,
    );
  }

  // Safety: Validate input data
  for (const update of updates) {
    if (!update.transactionId?.trim()) {
      throw new Error("Invalid transactionId: cannot be empty");
    }
    // At least one field must be provided for update
    if (!update.data.merchantName && !update.data.categorySlug) {
      throw new Error(
        "At least one of merchantName or categorySlug must be provided",
      );
    }
    // If merchantName is provided, it cannot be empty
    if (
      update.data.merchantName !== undefined &&
      !update.data.merchantName?.trim()
    ) {
      throw new Error("Invalid merchantName: cannot be empty when provided");
    }
  }

  try {
    // Deduplicate by transactionId — later entries override earlier ones so
    // the result matches sequential semantics if callers ever pass duplicates.
    const deduped = new Map<string, EnrichmentUpdateData>();
    for (const update of updates) {
      const existing = deduped.get(update.transactionId);
      deduped.set(
        update.transactionId,
        existing ? { ...existing, ...update.data } : { ...update.data },
      );
    }

    const uniqueUpdates = Array.from(deduped.entries());

    const CHUNK_SIZE = 50;
    for (let i = 0; i < uniqueUpdates.length; i += CHUNK_SIZE) {
      const chunk = uniqueUpdates.slice(i, i + CHUNK_SIZE);

      await db.transaction(async (tx) => {
        const changed: { id: string; teamId: string }[] = [];
        // Lock in a consistent order. Apply saved categories after normalizing the
        // merchant and before filling empty categories with the model's result.
        for (const [transactionId, data] of [...chunk].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          changed.push(
            ...(await tx
              .update(transactions)
              .set({
                enrichmentCompleted: true,
                ...(data.merchantName
                  ? { merchantName: data.merchantName }
                  : {}),
              })
              .where(eq(transactions.id, transactionId))
              .returning({ id: transactions.id, teamId: transactions.teamId })),
          );
        }
        for (const teamId of new Set(changed.map((row) => row.teamId))) {
          await applyTransactionRecurrenceRules(tx, {
            teamId,
            transactionIds: changed
              .filter((row) => row.teamId === teamId)
              .map((row) => row.id),
          });
        }
        for (const [transactionId, data] of chunk) {
          if (data.categorySlug)
            await tx
              .update(transactions)
              .set({
                // A manual choice made while the model was running wins too.
                categorySlug: sql`COALESCE(${transactions.categorySlug}, ${data.categorySlug})`,
              })
              .where(eq(transactions.id, transactionId));
        }
      });
    }
  } catch (error) {
    throw new Error(
      `Failed to update transaction enrichments: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Mark transactions as enrichment completed without updating any other fields
 * Used for transactions that don't need merchant/category updates but should be marked as processed
 *
 * @param db - Database connection
 * @param transactionIds - Array of transaction IDs to mark as enriched
 */
export async function markTransactionsAsEnriched(
  db: Database,
  transactionIds: string[],
): Promise<void> {
  if (transactionIds.length === 0) {
    return;
  }

  // Safety: Limit batch size to prevent query size issues
  if (transactionIds.length > 1000) {
    throw new Error(
      `Batch size too large: ${transactionIds.length}. Maximum allowed: 1000`,
    );
  }

  // Safety: Validate input data
  for (const id of transactionIds) {
    if (!id?.trim()) {
      throw new Error("Invalid transactionId: cannot be empty");
    }
  }

  try {
    await db
      .update(transactions)
      .set({ enrichmentCompleted: true })
      .where(inArray(transactions.id, transactionIds));
  } catch (error) {
    throw new Error(
      `Failed to mark transactions as enriched: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
