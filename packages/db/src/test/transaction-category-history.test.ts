import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Database } from "../client";
import { resolveIncomingCategories } from "../queries/transaction-category-history";

const incoming = {
  teamId: "team-a",
  bankAccountId: "account-a",
  name: "CD SINPE CITIBANK EUROPE PLC-",
  currency: "CRC",
  amount: 100,
  categorySlug: null,
};
const previous = {
  ...incoming,
  name: "Cd Sinpe Citibank Europe Plc",
  categorySlug: "income",
};

function mockDb(history: Array<typeof previous>) {
  let query: ReturnType<PgDialect["sqlToQuery"]> | undefined;
  const db = {
    select: () => ({
      from: () => ({
        where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
          query = new PgDialect().sqlToQuery(condition);
          return { groupBy: async () => history };
        },
      }),
    }),
  } as unknown as Database;
  return { db, query: () => query };
}

describe("incoming category history", () => {
  test("recognizes the same incoming source despite case and trailing punctuation", async () => {
    const { db, query } = mockDb([previous]);
    const result = await resolveIncomingCategories(db, [incoming]);
    expect(result[0]?.categorySlug).toBe("income");
    expect(query()?.params).toContain("team-a");
    expect(query()?.params).toContain("account-a");
    expect(query()?.params).toContain("CRC");
    expect(query()?.sql).toContain('"transactions"."team_id" =');
    expect(query()?.sql).toContain('"transactions"."bank_account_id" =');
    expect(query()?.sql).toContain('"transactions"."currency" =');
    expect(query()?.sql).toContain('"transactions"."amount" >');
    expect(query()?.sql).toContain('"transactions"."internal" =');
  });

  test("does not guess when a description has conflicting categories", async () => {
    const { db } = mockDb([
      previous,
      { ...previous, categorySlug: "transfer" },
    ]);
    expect(
      (await resolveIncomingCategories(db, [incoming]))[0]?.categorySlug,
    ).toBeNull();
  });

  test("reuses a known non-revenue category too", async () => {
    const { db } = mockDb([{ ...previous, categorySlug: "loan-proceeds" }]);
    expect(
      (await resolveIncomingCategories(db, [incoming]))[0]?.categorySlug,
    ).toBe("loan-proceeds");
  });

  test("does not borrow a category from another team, account, or currency", async () => {
    const { db } = mockDb([previous]);
    for (const change of [
      { teamId: "team-b" },
      { bankAccountId: "account-b" },
      { currency: "USD" },
    ]) {
      expect(
        (await resolveIncomingCategories(db, [{ ...incoming, ...change }]))[0]
          ?.categorySlug,
      ).toBeNull();
    }
  });

  test("preserves explicit categories, outgoing payments, and internal transfers", async () => {
    const candidates = [
      { ...incoming, categorySlug: "capital-investment" },
      { ...incoming, amount: -100 },
      { ...incoming, internal: true },
    ];
    const { db, query } = mockDb([previous]);
    expect(await resolveIncomingCategories(db, candidates)).toEqual(candidates);
    expect(query()).toBeUndefined();
  });

  test("leaves a new source for enrichment", async () => {
    const { db } = mockDb([]);
    expect(await resolveIncomingCategories(db, [incoming])).toEqual([incoming]);
  });
});
