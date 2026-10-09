import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseOrTransaction } from "../client";
import {
  transactionRecurrenceRules as rules,
  transactionCategories,
  transactions,
} from "../schema";
import { matchesRecurrenceRule } from "../utils/transaction-recurrence";

/** Call inside the same transaction as a user's explicit recurrence correction. */
export async function saveTransactionRecurrenceRules(
  db: DatabaseOrTransaction,
  teamId: string,
  ids: string[],
) {
  if (!ids.length) return;
  const sources = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.teamId, teamId), inArray(transactions.id, ids)));
  for (const source of sources) {
    const values = {
      teamId,
      sourceTransactionId: source.id,
      name: source.name,
      merchantName: source.merchantName,
      amount: source.amount,
      currency: source.currency,
      date: source.date,
      recurring: source.recurring === true,
      frequency: source.frequency,
      categorySlug: source.categorySlug,
      updatedAt: sql`clock_timestamp()`,
    };
    await db
      .insert(rules)
      .values(values)
      .onConflictDoUpdate({ target: rules.sourceTransactionId, set: values });
  }
}

/** Refresh a rule's payment details without changing correction precedence. */
export async function refreshTransactionRecurrenceRules(
  db: DatabaseOrTransaction,
  teamId: string,
  ids: string[],
) {
  if (!ids.length) return;
  await db.execute(sql`
    UPDATE ${rules} SET
      name = ${transactions.name}, merchant_name = ${transactions.merchantName},
      amount = ${transactions.amount}, currency = ${transactions.currency},
      date = ${transactions.date}, category_slug = ${transactions.categorySlug}
    FROM ${transactions}
    WHERE ${rules.sourceTransactionId} = ${transactions.id}
      AND ${rules.teamId} = ${teamId} AND ${transactions.teamId} = ${teamId}
      AND ${inArray(transactions.id, ids)}
  `);
}

/** Apply on the primary connection, after insertion and again after enrichment.
 * Row locks and the override predicate keep concurrent manual corrections safe.
 */
export async function applyTransactionRecurrenceRules(
  db: DatabaseOrTransaction,
  params: { teamId: string; transactionIds: string[]; dryRun?: boolean },
) {
  const { teamId, transactionIds } = params;
  if (!transactionIds.length) return 0;
  if (transactionIds.length > 500) {
    let count = 0;
    for (let i = 0; i < transactionIds.length; i += 500) {
      count += await applyTransactionRecurrenceRules(db, {
        ...params,
        transactionIds: transactionIds.slice(i, i + 500),
      });
    }
    return count;
  }
  return db.transaction(async (tx) => {
    // Lock transactions before rules, matching the order used by manual edits.
    const targets = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.teamId, teamId),
          inArray(transactions.id, transactionIds),
        ),
      )
      .orderBy(transactions.id)
      .for("update");
    // Merchant normalization may finish after a user has confirmed recurrence.
    if (!params.dryRun)
      await refreshTransactionRecurrenceRules(tx, teamId, transactionIds);
    const savedRules = await tx
      .select()
      .from(rules)
      .where(eq(rules.teamId, teamId))
      .orderBy(desc(rules.updatedAt), desc(rules.id));
    if (!savedRules.length) return 0;
    const categories = new Set(
      (
        await tx
          .select({ slug: transactionCategories.slug })
          .from(transactionCategories)
          .where(eq(transactionCategories.teamId, teamId))
      ).map((c) => c.slug),
    );
    let count = 0;
    for (const target of targets) {
      if (
        target.recurrenceOverride ||
        target.internal ||
        target.status === "excluded"
      )
        continue;
      const rule = savedRules.find((candidate) =>
        matchesRecurrenceRule(target, candidate),
      );
      if (!rule) continue;
      // Preserve categories already chosen by the user or supplied by the bank.
      const categorySlug =
        !target.categorySlug &&
        rule.recurring &&
        rule.categorySlug &&
        categories.has(rule.categorySlug)
          ? rule.categorySlug
          : undefined;
      if (!params.dryRun)
        await tx
          .update(transactions)
          .set({
            recurring: rule.recurring,
            frequency: rule.recurring ? rule.frequency : null,
            ...(categorySlug ? { categorySlug } : {}),
          })
          .where(
            and(
              eq(transactions.teamId, teamId),
              eq(transactions.id, target.id),
              eq(transactions.recurrenceOverride, false),
            ),
          );
      count++;
    }
    return count;
  });
}
