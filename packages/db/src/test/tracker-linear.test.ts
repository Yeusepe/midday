import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import type { Database } from "../client";
import { draftInvoiceFromTracker } from "../queries/invoices";
import {
  getTrackerEntryById,
  getTrackerRecordsByRange,
  startTimer,
  stopTimer,
  upsertTrackerEntries,
} from "../queries/tracker-entries";
import { setTrackerLinearIssues } from "../queries/tracker-linear";
import * as schema from "../schema";
import { fixtureTable } from "./helpers/linear-fixture";

const pg = new PGlite();
const database = drizzle(pg, { schema });
const db = database as unknown as Database;
const teamId = "11111111-1111-4111-8111-111111111111";
const otherTeam = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const orgId = "55555555-5555-4555-8555-555555555555";
const issueA: schema.LinearIssueDetails = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  organizationId: orgId,
  identifier: "FUR-10",
  title: "Private implementation details",
  url: "https://linear.app/fixture/issue/FUR-10",
  linearTeamId: orgId,
  projectId,
  updatedAt: "2026-11-01T00:00:00.000Z",
  archivedAt: null,
};
const issueB = {
  ...issueA,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  identifier: "FUR-20",
};
const invoiceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

beforeAll(async () => {
  await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  for (const table of [
    schema.teams,
    schema.users,
    schema.customers,
    schema.trackerProjects,
    schema.trackerEntries,
    schema.invoices,
    schema.activities,
  ])
    await pg.exec(fixtureTable(table));
  await pg.exec(
    await readFile(
      join(__dirname, "../../migrations/0046_tracker_linear_issues.sql"),
      "utf8",
    ),
  );
  await database
    .insert(schema.teams)
    .values([{ id: teamId }, { id: otherTeam }]);
  await database.insert(schema.users).values({ id: userId });
  await database.insert(schema.trackerProjects).values({
    id: projectId,
    teamId,
    name: "Fixture project",
    rate: 100,
    currency: "USD",
    billable: true,
  });
}, 30000);
afterAll(async () => {
  await pg.close();
});

describe("Linear tracker integration", () => {
  test("multiple ticket references survive invoicing, retries, and unlinking without financial changes", async () => {
    const [first] = await upsertTrackerEntries(db, {
      teamId,
      projectId,
      assignedId: userId,
      dates: ["2026-11-01"],
      start: "2026-11-01T14:00:00Z",
      stop: "2026-11-01T15:00:00Z",
      duration: 3600,
      description: "Client-safe planning",
      verifiedLinearIssues: [issueA, issueB],
      linearIssueIds: [issueA.id, issueB.id, issueA.id],
    });
    const [second] = await upsertTrackerEntries(db, {
      teamId,
      projectId,
      assignedId: userId,
      dates: ["2026-11-02"],
      start: "2026-11-02T14:00:00Z",
      stop: "2026-11-02T16:00:00Z",
      duration: 7200,
      description: "Client-safe implementation",
      verifiedLinearIssues: [issueA, issueB],
      linearIssueIds: [issueA.id],
    });
    expect(first!.linearIssues).toHaveLength(2);
    expect(second!.linearIssues).toHaveLength(1);
    const records = await getTrackerRecordsByRange(db, {
      teamId,
      projectId,
      from: "2026-11-01",
      to: "2026-11-02",
    });
    expect(records.meta.totalDuration).toBe(10800);
    expect(records.meta.totalAmount).toBe(300);
    expect(records.result["2026-11-01"]![0]!.linearIssues).toHaveLength(2);
    await draftInvoiceFromTracker(db, {
      id: invoiceId,
      teamId,
      userId,
      token: "fixture-token",
      template: { currency: "USD" },
      invoiceNumber: "FIXTURE-1",
      issueDate: "2026-11-02",
      dueDate: "2026-12-02",
      amount: 300,
      lineItems: [
        { name: "Client-safe work", quantity: 3, price: 100, unit: "hours" },
      ],
      trackerEntryIds: [first!.id, second!.id],
      uninvoicedOnly: true,
    });
    const before = await database.select().from(schema.trackerEntries);
    const invoicesBefore = await database.select().from(schema.invoices);

    const references = (await getTrackerEntryById(db, {
      teamId,
      id: first!.id,
    }))!.linearIssues;
    expect(references.find((issue) => issue.id === issueA.id)).toEqual({
      id: issueA.id,
      organizationId: orgId,
    });
    expect(
      JSON.stringify(await database.select().from(schema.linearIssues)),
    ).not.toContain("Private implementation");
    await db.transaction((tx) =>
      setTrackerLinearIssues(tx, teamId, first!.id, [issueA.id]),
    );
    await db.transaction((tx) =>
      setTrackerLinearIssues(tx, teamId, first!.id, [issueA.id]),
    );
    await db.transaction((tx) =>
      setTrackerLinearIssues(tx, teamId, second!.id, []),
    );
    expect(await database.select().from(schema.trackerEntries)).toEqual(before);
    expect(await database.select().from(schema.invoices)).toEqual(
      invoicesBefore,
    );
    expect(JSON.stringify(invoicesBefore)).not.toContain("confidential");
    expect(
      (
        await getTrackerRecordsByRange(db, {
          teamId,
          projectId,
          uninvoicedOnly: true,
        })
      ).meta.totalDuration,
    ).toBe(0);
    expect(
      (await getTrackerEntryById(db, { teamId, id: second!.id }))!.linearIssues,
    ).toEqual([]);
  });

  test("new links affect only the requested entry when other entries share its date", async () => {
    const params = {
      teamId,
      projectId,
      assignedId: userId,
      dates: ["2026-10-01"],
      start: "2026-10-01T14:00:00Z",
      stop: "2026-10-01T15:00:00Z",
      duration: 3600,
    };
    const [existing] = await upsertTrackerEntries(db, params);
    const created = await upsertTrackerEntries(db, {
      ...params,
      verifiedLinearIssues: [issueA, issueB],
      linearIssueIds: [issueA.id, issueB.id],
    });
    expect(created).toHaveLength(1);
    expect(created[0]!.linearIssues).toHaveLength(2);
    expect(
      (await getTrackerEntryById(db, { teamId, id: existing!.id }))!
        .linearIssues,
    ).toEqual([]);
    const [updated] = await upsertTrackerEntries(db, {
      ...params,
      id: created[0]!.id,
      description: "Client-safe revised description",
    });
    expect(updated!.linearIssues).toHaveLength(2);
  });

  test("timer start/read/stop keeps structured tickets and the full duration", async () => {
    const start = new Date(Date.now() - 90 * 60_000).toISOString();
    const timer = await startTimer(db, {
      teamId,
      projectId,
      assignedId: userId,
      start,
      verifiedLinearIssues: [issueA, issueB],
      linearIssueIds: [issueA.id, issueB.id],
    });
    expect(timer.linearIssues).toHaveLength(2);
    const stopped = await stopTimer(db, {
      teamId,
      entryId: timer.id,
      assignedId: userId,
    });
    expect(stopped.duration).toBeGreaterThanOrEqual(5400);
    expect(
      (await getTrackerEntryById(db, { teamId, id: timer.id }))!.linearIssues,
    ).toHaveLength(2);
  });

  test("unknown and cross-tenant links fail atomically without altering existing links", async () => {
    const [entry] = await database
      .select()
      .from(schema.trackerEntries)
      .where(eq(schema.trackerEntries.invoiceId, invoiceId));
    const before = await getTrackerEntryById(db, { teamId, id: entry!.id });
    await expect(
      db.transaction((tx) =>
        setTrackerLinearIssues(tx, otherTeam, entry!.id, []),
      ),
    ).rejects.toThrow("Time entry not found");
    await expect(
      db.transaction((tx) =>
        setTrackerLinearIssues(tx, teamId, entry!.id, [
          "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        ]),
      ),
    ).rejects.toThrow("Verify new tickets");
    expect(await getTrackerEntryById(db, { teamId, id: entry!.id })).toEqual(
      before,
    );
    const entriesBefore = await database.select().from(schema.trackerEntries);
    await expect(
      startTimer(db, {
        teamId,
        projectId,
        verifiedLinearIssues: [issueA, issueB],
        linearIssueIds: ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
      }),
    ).rejects.toThrow();
    expect(await database.select().from(schema.trackerEntries)).toEqual(
      entriesBefore,
    );
  });
});
