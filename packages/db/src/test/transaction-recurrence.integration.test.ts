import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Database } from "../client";
import { getTransactionInsights } from "../queries/reports";
import {
  getPendingImportedTransactionIds,
  getTransactionsForEnrichment,
  updateTransactionEnrichments,
} from "../queries/transaction-enrichment";
import {
  applyTransactionRecurrenceRules,
  detectAndSaveTransactionRecurrence,
  refreshTransactionRecurrenceRules,
  saveTransactionRecurrenceRules,
} from "../queries/transaction-recurrence";
import {
  getSimilarTransactions,
  upsertTransactions,
} from "../queries/transactions";
import { withReplicas } from "../replicas";
import * as schema from "../schema";

// Dedicated PostgreSQL test database; every table lives in a disposable schema.
const url = process.env.RECURRENCE_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("recurrence persistence and enrichment recovery", () => {
  const namespace = `recurrence_${crypto.randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({
    connectionString: url,
    options: `-c search_path=${namespace},public`,
  });
  const primary = drizzle(pool, { schema, casing: "snake_case" });
  const db = withReplicas(
    primary,
    [primary],
    (replicas) => replicas[0]!,
  ) as Database;
  const teamId = crypto.randomUUID();
  const otherTeam = crypto.randomUUID();
  let sourceId: string;

  beforeAll(async () => {
    await pool.query(`
      CREATE SCHEMA ${namespace};
      CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
      CREATE SCHEMA IF NOT EXISTS private;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        IF to_regprocedure('private.get_teams_for_authenticated_user()') IS NULL THEN
          EXECUTE 'CREATE FUNCTION private.get_teams_for_authenticated_user() RETURNS SETOF uuid LANGUAGE sql AS ''SELECT NULL::uuid WHERE false''';
        END IF;
      END $$;
      CREATE TYPE transaction_frequency AS ENUM ('weekly', 'biweekly', 'monthly', 'semi_monthly', 'annually', 'irregular', 'unknown');
      CREATE TABLE teams (id uuid PRIMARY KEY);
      CREATE TABLE transaction_categories (team_id uuid, slug text, excluded boolean DEFAULT false);
      CREATE TABLE exchange_rates (base text, target text, rate numeric, updated_at timestamptz);
      CREATE TABLE transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
        date date NOT NULL, name text NOT NULL, method text NOT NULL, amount numeric(10,2) NOT NULL,
        currency text NOT NULL, team_id uuid NOT NULL REFERENCES teams(id), assigned_id uuid, note text,
        bank_account_id uuid, internal_id text UNIQUE NOT NULL, status text DEFAULT 'posted', balance numeric,
        manual boolean DEFAULT false, notified boolean DEFAULT false, internal boolean DEFAULT false,
        description text, category_slug text, "baseAmount" numeric, counterparty_name text, base_currency text,
        tax_amount numeric, tax_rate numeric, tax_type text, recurring boolean, frequency transaction_frequency,
        merchant_name text, enrichment_completed boolean DEFAULT false, fts_vector tsvector DEFAULT ''::tsvector
      );
    `);
    await pool.query("INSERT INTO teams VALUES ($1)", [teamId]);
    const legacyRecurring = crypto.randomUUID();
    const legacyDefault = crypto.randomUUID();
    await pool.query(
      `INSERT INTO transactions (id, team_id, name, amount, currency, date, method, internal_id, recurring, frequency)
      VALUES ($1, $3, 'MSFT', -20, 'USD', '2026-01-31', 'other', 'legacy-yes', true, 'monthly'),
             ($2, $3, 'MSFT', -20, 'USD', '2026-02-28', 'other', 'legacy-default', false, null)`,
      [legacyRecurring, legacyDefault, teamId],
    );
    await pool.query(
      readFileSync(
        join(
          __dirname,
          "../../migrations/0044_add_transaction_recurrence_rules.sql",
        ),
        "utf8",
      ),
    );
    expect((await read(legacyRecurring)).recurrenceOverride).toBe(true);
    expect((await read(legacyDefault)).recurrenceOverride).toBe(false);
    expect(
      await db.select().from(schema.transactionRecurrenceRules),
    ).toHaveLength(1);
  });
  afterAll(async () => {
    await pool.query(`DROP SCHEMA ${namespace} CASCADE`);
    await pool.end();
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE transaction_recurrence_rules, transactions, transaction_categories, teams CASCADE",
    );
    await pool.query("INSERT INTO teams VALUES ($1), ($2)", [
      teamId,
      otherTeam,
    ]);
    await pool.query(
      "INSERT INTO transaction_categories (team_id, slug) VALUES ($1, 'software'), ($1, 'office-supplies')",
      [teamId],
    );
    sourceId = await insert({
      date: "2026-01-31",
      recurring: true,
      frequency: "monthly",
      recurrenceOverride: true,
      categorySlug: "software",
    });
    await saveTransactionRecurrenceRules(db, teamId, [sourceId]);
  });

  async function insert(
    change: Partial<typeof schema.transactions.$inferInsert> = {},
  ) {
    const [row] = await db
      .insert(schema.transactions)
      .values({
        teamId,
        name: "MSFT",
        merchantName: "Microsoft",
        amount: -20,
        currency: "USD",
        date: "2026-02-28",
        method: "other",
        internalId: crypto.randomUUID(),
        ...change,
      })
      .returning({ id: schema.transactions.id });
    return row!.id;
  }
  async function read(id: string) {
    return (
      await db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.id, id))
    )[0]!;
  }

  test("detects and persists previously unmarked history without a seed rule", async () => {
    const ids = [];
    for (const date of ["2026-01-05", "2026-02-05", "2026-03-05"]) {
      ids.push(
        await insert({
          name: "Netflix",
          merchantName: "Netflix",
          date,
          recurring: false,
        }),
      );
    }
    const report = await getTransactionInsights(db, {
      teamId,
      from: "2026-03-01",
      to: "2026-03-31",
      currency: "USD",
    });
    expect(report.series.find((row) => row.name === "Netflix")).toMatchObject({
      detected: true,
      frequency: "monthly",
      observations: 3,
    });
    expect(report.detectedCount).toBe(3);
    expect(
      await detectAndSaveTransactionRecurrence(db, { teamId, dryRun: true }),
    ).toMatchObject({ detected: 3 });
    expect((await read(ids[0]!)).recurring).toBe(false);
    expect(
      await detectAndSaveTransactionRecurrence(db, { teamId }),
    ).toMatchObject({ detected: 3 });
    for (const id of ids)
      expect(await read(id)).toMatchObject({
        recurring: true,
        frequency: "monthly",
        recurrenceOverride: false,
      });
    const savedReport = await getTransactionInsights(db, {
      teamId,
      from: "2026-03-01",
      to: "2026-03-31",
      currency: "USD",
    });
    expect(savedReport.detectedCount).toBe(0);
    expect(savedReport.actuals.recurringExpenses).toBe(20);
    expect(
      await detectAndSaveTransactionRecurrence(db, { teamId }),
    ).toMatchObject({ detected: 0 });
  });

  test("a concurrent opt-out wins against history-based detection", async () => {
    const ids = [];
    for (const date of ["2026-01-05", "2026-02-05", "2026-03-05"]) {
      ids.push(
        await insert({
          name: "Netflix",
          merchantName: "Netflix",
          date,
          recurring: false,
        }),
      );
    }
    let release!: () => void;
    let locked!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const edit = db.transaction(async (tx) => {
      await tx
        .update(schema.transactions)
        .set({ recurring: false, recurrenceOverride: true })
        .where(eq(schema.transactions.id, ids[0]!));
      locked();
      await hold;
      await saveTransactionRecurrenceRules(tx, teamId, [ids[0]!]);
    });
    await ready;
    const scan = detectAndSaveTransactionRecurrence(db, { teamId });
    release();
    const [, result] = await Promise.all([edit, scan]);
    expect(result.detected).toBe(0);
    for (const id of ids) expect((await read(id)).recurring).toBe(false);
  });

  test("history detection respects opt-outs and excludes transfers, pending rows, categories and other teams", async () => {
    const ids = [];
    for (const date of ["2026-01-05", "2026-02-05", "2026-03-05"]) {
      ids.push(
        await insert({
          name: "Netflix",
          merchantName: "Netflix",
          date,
          recurring: false,
        }),
      );
      await insert({
        name: "Transfer",
        merchantName: "Transfer",
        date,
        internal: true,
      });
      await insert({
        name: "Pending",
        merchantName: "Pending",
        date,
        status: "pending",
      });
      await insert({
        name: "Other team",
        merchantName: "Other team",
        date,
        teamId: otherTeam,
      });
      await insert({
        name: "Excluded category",
        merchantName: "Excluded category",
        date,
        categorySlug: "excluded",
      });
    }
    await pool.query(
      "INSERT INTO transaction_categories (team_id, slug, excluded) VALUES ($1, 'excluded', true)",
      [teamId],
    );
    await db
      .update(schema.transactions)
      .set({ recurring: false, recurrenceOverride: true })
      .where(eq(schema.transactions.id, ids[0]!));
    await saveTransactionRecurrenceRules(db, teamId, [ids[0]!]);
    expect(
      await detectAndSaveTransactionRecurrence(db, { teamId }),
    ).toMatchObject({ detected: 0 });
    for (const id of ids) expect((await read(id)).recurring).toBe(false);
    const others = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.teamId, otherTeam));
    expect(others.every((row) => !row.recurring)).toBe(true);
  });
  async function apply(ids: string[]) {
    return applyTransactionRecurrenceRules(db, { teamId, transactionIds: ids });
  }

  test("CSV insertion applies a confirmed rule atomically and deduplicates retries", async () => {
    const input = {
      teamId,
      transactions: [
        {
          teamId,
          name: "MSFT",
          amount: -20,
          currency: "USD",
          date: "2026-02-28",
          method: "other" as const,
          bankAccountId: null,
          internalId: "import-1",
          status: "posted" as const,
          manual: true,
          recurring: false,
          frequency: null,
        },
      ],
    };
    const [created] = await upsertTransactions(db, input);
    expect(await read(created!.id)).toMatchObject({
      recurring: true,
      frequency: "monthly",
      categorySlug: "software",
      recurrenceOverride: false,
    });
    expect(await upsertTransactions(db, input)).toEqual([]);
    expect(
      await getPendingImportedTransactionIds(db, {
        teamId,
        internalIds: ["import-1"],
      }),
    ).toEqual([{ id: created!.id }]);
    expect(
      await getPendingImportedTransactionIds(db, {
        teamId: otherTeam,
        internalIds: ["import-1"],
      }),
    ).toEqual([]);
  });
  test("enrichment learns across changed raw names and prefers the saved category to AI", async () => {
    const id = await insert({ name: "MICROSOFT 456", merchantName: null });
    expect(await apply([id])).toBe(0);
    await updateTransactionEnrichments(db, [
      {
        transactionId: id,
        data: { merchantName: "Microsoft", categorySlug: "office-supplies" },
      },
    ]);
    expect(await read(id)).toMatchObject({
      recurring: true,
      frequency: "monthly",
      categorySlug: "software",
      enrichmentCompleted: true,
    });
    await apply([id]);
    expect(await read(id)).toMatchObject({
      recurrenceOverride: false,
      recurring: true,
    });
  });
  test("manual categories and negative recurrence corrections survive enrichment", async () => {
    const id = await insert({
      recurrenceOverride: true,
      recurring: false,
      categorySlug: "office-supplies",
    });
    await updateTransactionEnrichments(db, [
      {
        transactionId: id,
        data: { merchantName: "Microsoft", categorySlug: "software" },
      },
    ]);
    expect(await read(id)).toMatchObject({
      recurring: false,
      categorySlug: "office-supplies",
    });
  });
  test("latest opt-out prevents future recurrence even after deleting its source", async () => {
    const optOut = await insert({ recurring: false, recurrenceOverride: true });
    await saveTransactionRecurrenceRules(db, teamId, [optOut]);
    await db
      .delete(schema.transactions)
      .where(eq(schema.transactions.id, optOut));
    const id = await insert({ recurring: true });
    await apply([id]);
    expect(await read(id)).toMatchObject({ recurring: false, frequency: null });
  });
  test("keeps tenants, currencies, refunds, service amounts, and off-schedule charges separate", async () => {
    const ids = await Promise.all([
      insert({ teamId: otherTeam }),
      insert({ amount: 20 }),
      insert({ currency: "EUR" }),
      insert({ amount: -100 }),
      insert({ date: "2026-02-15" }),
      insert({ internal: true }),
    ]);
    expect(await apply(ids)).toBe(0);
    for (const id of ids) expect((await read(id)).recurring).toBeNull();
  });
  test("legacy null completion flags are eligible for retry", async () => {
    const id = await insert({ enrichmentCompleted: null });
    expect(
      await getTransactionsForEnrichment(db, { teamId, transactionIds: [id] }),
    ).toHaveLength(1);
    await updateTransactionEnrichments(db, [
      { transactionId: id, data: { merchantName: "Microsoft" } },
    ]);
    expect(
      await getTransactionsForEnrichment(db, { teamId, transactionIds: [id] }),
    ).toEqual([]);
  });
  test("backfill preview does not persist changes", async () => {
    const id = await insert();
    expect(
      await applyTransactionRecurrenceRules(db, {
        teamId,
        transactionIds: [id],
        dryRun: true,
      }),
    ).toBe(1);
    expect((await read(id)).recurring).toBeNull();
    expect(await apply([id])).toBe(1);
    expect((await read(id)).recurring).toBe(true);
  });

  test("the similar-payment query returns exactly one eligible match", async () => {
    const id = await insert();
    await insert({ amount: -100 });
    await insert({ currency: "EUR" });
    await insert({ date: "2026-02-15" });
    const matches = await getSimilarTransactions(db, {
      teamId,
      transactionId: sourceId,
      name: "MSFT",
      frequency: "monthly",
    });
    expect(matches.map((row) => row.id)).toEqual([id]);
  });

  test("a rule learns its source merchant when enrichment finishes later", async () => {
    await db
      .update(schema.transactions)
      .set({ merchantName: null })
      .where(eq(schema.transactions.id, sourceId));
    await saveTransactionRecurrenceRules(db, teamId, [sourceId]);
    await updateTransactionEnrichments(db, [
      { transactionId: sourceId, data: { merchantName: "Microsoft" } },
    ]);
    const id = await insert({ name: "MSFT 999" });
    await apply([id]);
    expect((await read(id)).recurring).toBe(true);
    expect(
      await db.select().from(schema.transactionRecurrenceRules),
    ).toHaveLength(1);
  });

  test("a concurrent manual opt-out wins against automatic classification", async () => {
    const id = await insert();
    let release!: () => void;
    let locked!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const edit = db.transaction(async (tx) => {
      await tx
        .update(schema.transactions)
        .set({ recurring: false, frequency: null, recurrenceOverride: true })
        .where(eq(schema.transactions.id, id));
      locked();
      await hold;
      await saveTransactionRecurrenceRules(tx, teamId, [id]);
    });
    await ready;
    const classification = apply([id]);
    release();
    await Promise.all([edit, classification]);
    expect(await read(id)).toMatchObject({
      recurring: false,
      frequency: null,
      recurrenceOverride: true,
    });
  });

  test("later category corrections update the saved rule without reviving older recurrence choices", async () => {
    const [before] = await db.select().from(schema.transactionRecurrenceRules);
    await db.transaction(async (tx) => {
      await tx
        .update(schema.transactions)
        .set({ categorySlug: "office-supplies" })
        .where(eq(schema.transactions.id, sourceId));
      await refreshTransactionRecurrenceRules(tx, teamId, [sourceId]);
    });
    const [after] = await db.select().from(schema.transactionRecurrenceRules);
    expect(after!.updatedAt).toBe(before!.updatedAt);
    const id = await insert();
    await apply([id]);
    expect((await read(id)).categorySlug).toBe("office-supplies");
  });
});
