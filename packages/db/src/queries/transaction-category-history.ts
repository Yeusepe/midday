import { and, eq, gt, isNotNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { transactions } from "../schema";

interface CategoryCandidate {
  teamId: string;
  bankAccountId: string;
  name: string;
  currency: string;
  amount: number;
  categorySlug?: string | null;
  internal?: boolean;
}

function normalizeName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[ .,:;-]+$/, "");
}

function categoryKey(transaction: {
  teamId: string;
  bankAccountId: string | null;
  name: string;
  currency: string;
}) {
  return JSON.stringify([
    transaction.teamId,
    transaction.bankAccountId,
    transaction.currency,
    normalizeName(transaction.name),
  ]);
}

/** Reuse an unambiguous category for the same deposit description and account. */
export async function resolveIncomingCategories<T extends CategoryCandidate>(
  db: Database,
  candidates: T[],
): Promise<T[]> {
  const missing = candidates.filter(
    (t) =>
      t.amount > 0 && !t.categorySlug && !t.internal && normalizeName(t.name),
  );
  if (missing.length === 0) return candidates;

  const scopes = new Map(missing.map((t) => [categoryKey(t), t]));
  const history = await db
    .select({
      teamId: transactions.teamId,
      bankAccountId: transactions.bankAccountId,
      currency: transactions.currency,
      name: transactions.name,
      categorySlug: transactions.categorySlug,
    })
    .from(transactions)
    .where(
      and(
        gt(transactions.amount, 0),
        eq(transactions.internal, false),
        notInArray(transactions.status, ["excluded", "archived"]),
        isNotNull(transactions.categorySlug),
        ne(transactions.categorySlug, "uncategorized"),
        or(
          ...Array.from(scopes.values(), (t) =>
            and(
              eq(transactions.teamId, t.teamId),
              eq(transactions.bankAccountId, t.bankAccountId),
              eq(transactions.currency, t.currency),
              sql`regexp_replace(lower(trim(${transactions.name})), '[ .,:;-]+$', '') = ${normalizeName(t.name)}`,
            ),
          ),
        ),
      ),
    )
    .groupBy(
      transactions.teamId,
      transactions.bankAccountId,
      transactions.currency,
      transactions.name,
      transactions.categorySlug,
    );

  const categories = new Map<string, Set<string>>();
  for (const previous of history) {
    if (!previous.categorySlug) continue;
    const key = categoryKey(previous);
    const values = categories.get(key) ?? new Set<string>();
    values.add(previous.categorySlug);
    categories.set(key, values);
  }

  return candidates.map((t) => {
    if (t.amount <= 0 || t.categorySlug || t.internal) return t;
    const matches = categories.get(categoryKey(t));
    if (matches?.size !== 1) return t;
    return { ...t, categorySlug: Array.from(matches)[0]! };
  });
}
