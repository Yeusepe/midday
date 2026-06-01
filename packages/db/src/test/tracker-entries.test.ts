import { describe, expect, test } from "bun:test";
import { stopTimer } from "../queries/tracker-entries";

describe("tracker entries queries", () => {
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
