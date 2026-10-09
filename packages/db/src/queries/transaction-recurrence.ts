import { and, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Database, DatabaseOrTransaction } from "../client";
import {
  transactionRecurrenceRules as rules,
  transactionCategories,
  transactions,
} from "../schema";
import { matchesRecurrenceRule } from "../utils/transaction-recurrence";
import { detectTransactionRecurrence } from "../utils/detect-transaction-recurrence";

/** Infer history without locking it, then lock only changed rows in ID order.
 * Re-read candidates and saved corrections after locking so manual choices win.
 */
export async function detectAndSaveTransactionRecurrence(
  db: Database,
  params: { teamId: string; dryRun?: boolean },
) {
  return db.transaction(async (tx) => {
    const fields = {
      id: transactions.id,
      teamId: transactions.teamId,
      name: transactions.name,
      merchantName: transactions.merchantName,
      amount: transactions.amount,
      currency: transactions.currency,
      date: transactions.date,
      bankAccountId: transactions.bankAccountId,
      recurring: transactions.recurring,
      recurrenceOverride: transactions.recurrenceOverride,
      frequency: transactions.frequency,
      categorySlug: transactions.categorySlug,
    };
    const eligible = and(
      eq(transactions.teamId, params.teamId),
      eq(transactions.internal, false),
      ne(transactions.status, "excluded"),
      ne(transactions.status, "pending"),
      or(
        isNull(transactions.categorySlug),
        ne(transactions.categorySlug, "transfer"),
      ),
      lte(transactions.date, new Date().toISOString().slice(0, 10)),
      or(
        isNull(transactionCategories.excluded),
        eq(transactionCategories.excluded, false),
      ),
    );
    const categoryJoin = and(
      eq(transactionCategories.teamId, params.teamId),
      eq(transactionCategories.slug, transactions.categorySlug),
    );
    const history = await tx
      .select(fields)
      .from(transactions)
      .leftJoin(transactionCategories, categoryJoin)
      .where(eligible);
    /** Read corrections in precedence order, including edits committed during lock waits. */
    const readRules = () =>
      tx
        .select()
        .from(rules)
        .where(eq(rules.teamId, params.teamId))
        .orderBy(desc(rules.updatedAt), desc(rules.id));
    const savedRules = await readRules();
    const categories = new Set(
      (
        await tx
          .select({ slug: transactionCategories.slug })
          .from(transactionCategories)
          .where(eq(transactionCategories.teamId, params.teamId))
      ).map((row) => row.slug),
    );

    /** Build only real changes; rule sources already refresh during edits/enrichment. */
    function changesFor(rows: typeof history, corrections: typeof savedRules) {
      const detected = detectTransactionRecurrence(rows, corrections);
      const changes = new Map<
        string,
        {
          recurring: boolean;
          frequency: typeof transactions.$inferSelect.frequency;
          categorySlug?: string;
          detected: boolean;
        }
      >();
      for (const row of rows) {
        if (row.recurrenceOverride) continue;
        const rule = corrections.find((candidate) =>
          matchesRecurrenceRule(row, candidate),
        );
        if (rule) {
          const frequency = rule.recurring ? rule.frequency : null;
          const categorySlug =
            !row.categorySlug &&
            rule.recurring &&
            rule.categorySlug &&
            categories.has(rule.categorySlug)
              ? rule.categorySlug
              : undefined;
          if (
            row.recurring !== rule.recurring ||
            row.frequency !== frequency ||
            categorySlug
          ) {
            changes.set(row.id, {
              recurring: rule.recurring,
              frequency,
              categorySlug,
              detected: false,
            });
          }
        } else {
          const match = detected.get(row.id);
          if (match)
            changes.set(row.id, {
              recurring: true,
              frequency: match.frequency,
              detected: true,
            });
        }
      }
      return changes;
    }
    let changes = changesFor(history, savedRules);
    if (!params.dryRun && changes.size) {
      const ids = [...changes.keys()].sort();
      const refreshed = new Map(history.map((row) => [row.id, row]));
      const lockedIds = new Set<string>();
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        const targets = await tx
          .select(fields)
          .from(transactions)
          .leftJoin(transactionCategories, categoryJoin)
          .where(and(eligible, inArray(transactions.id, batch)))
          .orderBy(transactions.id)
          .for("update", { of: transactions });
        for (const id of batch) refreshed.delete(id);
        for (const row of targets) {
          refreshed.set(row.id, row);
          lockedIds.add(row.id);
        }
      }
      // A correction committed while waiting for a candidate lock may suppress
      // its entire pattern. Recompute with the latest rules before any writes.
      changes = changesFor([...refreshed.values()], await readRules());
      const batches = new Map<
        string,
        {
          values: {
            recurring: boolean;
            frequency: typeof transactions.$inferSelect.frequency;
            categorySlug?: string;
          };
          ids: string[];
        }
      >();
      for (const [id, change] of changes) {
        if (!lockedIds.has(id)) {
          changes.delete(id);
          continue;
        }
        const { detected: _, ...values } = change;
        const key = JSON.stringify(values);
        const batch = batches.get(key) ?? { values, ids: [] };
        batch.ids.push(id);
        batches.set(key, batch);
      }
      for (const { values, ids } of batches.values()) {
        for (let i = 0; i < ids.length; i += 500) {
          await tx
            .update(transactions)
            .set(values)
            .where(
              and(
                eq(transactions.teamId, params.teamId),
                inArray(transactions.id, ids.slice(i, i + 500)),
                eq(transactions.recurrenceOverride, false),
              ),
            );
        }
      }
    }
    return {
      detected: [...changes.values()].filter((change) => change.detected)
        .length,
      ruleMatches: [...changes.values()].filter((change) => !change.detected)
        .length,
    };
  });
}

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
