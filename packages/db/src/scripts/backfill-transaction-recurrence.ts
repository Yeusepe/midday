// Usage: bun run src/scripts/backfill-transaction-recurrence.ts --team-id UUID [--apply]
// Requires migration 0044. Dry run by default; use the worker's database credentials.
import { and, eq, gt } from "drizzle-orm";
import {
  applyTransactionRecurrenceRules,
  detectAndSaveTransactionRecurrence,
} from "../queries/transaction-recurrence";
import { transactions } from "../schema";

import { closeWorkerDb, getWorkerDb } from "../worker-client";

async function main() {
  const args = process.argv.slice(2);
  const teamArg = args.indexOf("--team-id");
  const teamId = teamArg >= 0 ? args[teamArg + 1] : undefined;
  if (
    !teamId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      teamId,
    )
  ) {
    throw new Error(
      "Provide --team-id UUID (add --apply to persist the backfill)",
    );
  }
  const dryRun = !args.includes("--apply");
  const db = getWorkerDb();
  let cursor: string | undefined;
  let matched = 0;
  try {
    while (true) {
      const batch = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.teamId, teamId),
            eq(transactions.recurrenceOverride, false),
            cursor ? gt(transactions.id, cursor) : undefined,
          ),
        )
        .orderBy(transactions.id)
        .limit(500);
      if (!batch.length) break;
      matched += await applyTransactionRecurrenceRules(db, {
        teamId,
        transactionIds: batch.map((row) => row.id),
        dryRun,
      });
      cursor = batch.at(-1)!.id;
    }
    const { detected } = await detectAndSaveTransactionRecurrence(db, {
      teamId,
      dryRun,
    });
    console.log(JSON.stringify({ teamId, dryRun, matched, detected }));
  } finally {
    await closeWorkerDb();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Backfill failed");
  process.exitCode = 1;
});
