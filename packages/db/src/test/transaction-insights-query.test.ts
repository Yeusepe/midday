import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type { Database } from "../client";
import { getTransactionInsights } from "../queries/reports";
import { getTransactions } from "../queries/transactions";

// Exercise Drizzle's real SQL builder; only the PostgreSQL transport is replaced.
function captureQueries() {
  const queries: { text: string; values: unknown[] }[] = [];
  const client = {
    query: async (config: { text: string }, values: unknown[]) => {
      queries.push({ text: config.text, values });
      return { rows: [] };
    },
  };
  return {
    db: drizzle(client as unknown as Pool, {
      casing: "snake_case",
    }) as unknown as Database,
    queries,
  };
}

describe("transaction insight queries", () => {
  test("direct callers cannot pass unsupported recurring filters to PostgreSQL", async () => {
    const { db, queries } = captureQueries();
    for (const recurring of [["daily"], ["all", "daily"], ["none", "daily"]]) {
      await expect(
        getTransactions(db, { teamId: "team-a", recurring }),
      ).rejects.toThrow("Unsupported recurring filter");
    }
    expect(queries).toHaveLength(0);
  });
  test("scopes history and category exclusions to the team and preserves cross-currency rows", async () => {
    const { db, queries } = captureQueries();
    await getTransactionInsights(db, {
      teamId: "team-a",
      from: "2026-01-01",
      to: "2026-03-31",
      currency: "COP",
    });
    expect(queries).toHaveLength(2);
    const query = queries[0]!;
    const where = query.text.slice(query.text.lastIndexOf(" where "));
    expect(where).toContain('"transactions"."team_id" =');
    expect(query.text).toContain('"transaction_categories"."team_id" =');
    expect(where).toContain('"transactions"."internal" =');
    expect(where).toContain('"transactions"."status" <>');
    expect(where).toContain('"transaction_categories"."excluded"');
    // Unmarked history outside the selected period is required for detection.
    expect(where).not.toContain('"recurring" =');
    expect(where).not.toContain('"date" >=');
    expect(queries[1]!.text).toContain(
      '"transaction_recurrence_rules"."team_id" =',
    );
    expect(queries[1]!.values).toContain("team-a");
    expect(where).not.toContain('"transactions"."currency" =');
    expect(query.text).toContain('"exchange_rates"');
    expect(query.values).toContain("team-a");
    expect(query.values).toContain("excluded");
    expect(query.values).toContain("transfer");
    expect(query.values).toContain("income");
    expect(query.values).toContain("COP");
  });

  test("not marked recurring includes false and NULL; combinations use OR", async () => {
    const { db, queries } = captureQueries();
    await getTransactions(db, {
      teamId: "team-a",
      recurring: ["none", "monthly"],
    });
    const query = queries.find((item) =>
      item.text.includes('"transactions"."frequency" in'),
    )!;
    expect(query).toBeDefined();
    expect(query.text).toMatch(
      /"recurring" = \$\d+ or "transactions"\."recurring" is null\) or \("transactions"\."recurring" =/,
    );
    expect(query.values).toContain(false);
    expect(query.values).toContain(true);
    expect(query.values).toContain("monthly");
    expect(query.values).not.toContain("none");
  });
});
