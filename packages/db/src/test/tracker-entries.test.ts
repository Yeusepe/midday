import { describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  getTrackerRecordsByRange,
  stopTimer,
} from "../queries/tracker-entries";

describe("tracker entries queries", () => {
  test("all uninvoiced time is scoped to the team and project without date limits", async () => {
    const findMany = mock(async (_options: { where: SQL }) => []);
    const db = { query: { trackerEntries: { findMany } } };

    await getTrackerRecordsByRange(db as never, {
      teamId: "team-id",
      projectId: "project-id",
      uninvoicedOnly: true,
    });

    const options = findMany.mock.calls[0]![0];
    const query = new PgDialect().sqlToQuery(options.where);
    expect(query.sql).toContain('"tracker_entries"."team_id" =');
    expect(query.sql).toContain('"tracker_entries"."project_id" =');
    expect(query.sql).toContain('"tracker_entries"."billed" is not true');
    expect(query.sql).toContain('"tracker_entries"."invoice_id" is null');
    expect(query.sql).not.toContain('"date"');
    expect(query.params).toEqual(["team-id", "project-id"]);
  });

  test("dated tracker queries retain their inclusive date limits", async () => {
    const findMany = mock(async (_options: { where: SQL }) => []);
    const db = { query: { trackerEntries: { findMany } } };

    await getTrackerRecordsByRange(db as never, {
      teamId: "team-id",
      from: "2026-05-01",
      to: "2026-05-31",
    });

    const options = findMany.mock.calls[0]![0];
    const query = new PgDialect().sqlToQuery(options.where);
    expect(query.sql).toContain('"tracker_entries"."date" >=');
    expect(query.sql).toContain('"tracker_entries"."date" <=');
    expect(query.sql).not.toContain('"billed"');
    expect(query.sql).not.toContain('"invoice_id"');
    expect(query.params).toEqual(["team-id", "2026-05-01", "2026-05-31"]);
  });

  test("stopTimer saves description when provided", async () => {
    const start = new Date(Date.now() - 120_000).toISOString();
    const updatedEntry = {
      id: "entry-id",
      start,
      stop: new Date().toISOString(),
      duration: 120,
      description: "Shipped stopwatch notes",
      trackerProject: null,
      user: null,
    };
    let updatePayload: Record<string, unknown> | null = null;
    let findEntryCalls = 0;

    const db = {
      query: {
        trackerEntries: {
          findFirst: async () => {
            findEntryCalls += 1;

            if (findEntryCalls === 1) {
              return {
                id: "entry-id",
                teamId: "team-id",
                assignedId: "user-id",
                projectId: "project-id",
                start,
                stop: null,
                description: null,
              };
            }

            return updatedEntry;
          },
        },
      },
      update: () => ({
        set: (payload: Record<string, unknown>) => {
          updatePayload = payload;

          return {
            where: async () => undefined,
          };
        },
      }),
    };

    const result = await stopTimer(db as never, {
      teamId: "team-id",
      entryId: "entry-id",
      assignedId: "user-id",
      description: "Shipped stopwatch notes",
    });

    expect(updatePayload).toMatchObject({
      description: "Shipped stopwatch notes",
    });
    expect(result).toMatchObject({
      id: "entry-id",
      description: "Shipped stopwatch notes",
    });
  });
});
