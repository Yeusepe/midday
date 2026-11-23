import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import type { Database } from "../client";
import {
  getTrackerProjectById,
  getTrackerProjects,
  upsertTrackerProject,
} from "../queries/tracker-projects";
import * as schema from "../schema";
import { fixtureTable } from "./helpers/linear-fixture";

const pg = new PGlite();
const database = drizzle(pg, { schema });
const db = Object.assign(database, {
  executeOnReplica: async (query: SQL) => (await database.execute(query)).rows,
}) as unknown as Database;
const teamId = "11111111-1111-4111-8111-111111111111";

beforeAll(async () => {
  for (const table of [
    schema.teams,
    schema.customers,
    schema.trackerProjects,
    schema.tags,
    schema.trackerProjectTags,
    schema.activities,
  ]) {
    await pg.exec(fixtureTable(table));
  }
  await pg.exec(`
    ALTER TABLE tracker_projects ADD COLUMN linear_project jsonb;
    ALTER TABLE tracker_projects ALTER COLUMN billable SET DEFAULT false;
    CREATE FUNCTION total_duration(tracker_projects) RETURNS bigint LANGUAGE sql AS 'SELECT 0::bigint';
    CREATE FUNCTION get_project_total_amount(tracker_projects) RETURNS numeric LANGUAGE sql AS 'SELECT 0::numeric';
    CREATE FUNCTION get_assigned_users_for_project(tracker_projects) RETURNS json LANGUAGE sql AS 'SELECT ''[]''::json';
  `);
  await database.insert(schema.teams).values({ id: teamId });
}, 30000);

afterAll(() => pg.close());

test("billing persists through saves, unrelated updates, list reads, and explicit disabling", async () => {
  const created = await upsertTrackerProject(db, {
    teamId,
    name: "Fixture project",
  });
  expect(created!.billable).toBe(false);

  if (!created?.id) throw new Error("Fixture project was not created");
  const input = { teamId, id: created.id, name: "Fixture project" };
  const enabled = await upsertTrackerProject(db, {
    ...input,
    billable: true,
    rate: 100,
    currency: "USD",
  });
  expect(enabled).toMatchObject({ billable: true, rate: 100, currency: "USD" });

  await upsertTrackerProject(db, {
    ...input,
    description: "Updated independently",
  });
  expect(await getTrackerProjectById(db, input)).toMatchObject({
    billable: true,
    rate: 100,
    currency: "USD",
  });
  expect((await getTrackerProjects(db, { teamId })).data[0]).toMatchObject({
    billable: true,
    rate: 100,
  });

  await upsertTrackerProject(db, { ...input, billable: false });
  expect(await getTrackerProjectById(db, input)).toMatchObject({
    billable: false,
    rate: 100,
  });
  expect((await getTrackerProjects(db, { teamId })).data[0]!.billable).toBe(
    false,
  );
});
