// Install fixture environment and mocks before importing authenticated routers.
import "../setup";

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { OpenAPIHono } from "@hono/zod-openapi";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../../mcp/types";
import type { Context } from "../../rest/types";
import { createCallerFactory } from "../../trpc/init";
import type { Scope } from "../../utils/scopes";
import { createTestContext } from "../helpers/test-context";
import { mocks } from "../setup";

const issueId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const entryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const projectId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const refs = [
  { id: issueId, identifier: "ENG-99", title: "Internal moved ticket" },
];
const resolve = mock(async (..._args: unknown[]) => ({
  nodes: refs,
  exact: false,
  requiresChoice: true,
  pageInfo: { hasNextPage: false, endCursor: null },
}));
const verify = mock(async (..._args: unknown[]) => {
  throw new Error("Your Linear account cannot access this issue");
});
const update = mock(async (..._args: unknown[]) => refs);
mock.module("@api/services/linear", () => ({
  searchLinearIssues: resolve,
  verifyLinearIssueLinks: verify,
  getLinkedLinearProject: async () => null,
  updateEntryLinearIssues: update,
  getEntryLinearIssues: async () => refs,
  refreshLinearIssues: async () => refs,
  searchLinearProjects: async () => ({ nodes: [] }),
  linkLinearProject: async () => ({ linearProject: null }),
  linearConnectionStatus: async () => ({ connected: true }),
}));
const { registerTrackerLinearTools } = await import(
  "../../mcp/tools/tracker-linear"
);
const { trackerLinearRouter } = await import(
  "../../rest/routers/tracker-linear"
);
const { trackerEntriesRouter: trpcEntries } = await import(
  "../../trpc/routers/tracker-entries"
);
const { trackerEntriesRouter: restEntries } = await import(
  "../../rest/routers/tracker-entries"
);
const { registerTrackerTools } = await import("../../mcp/tools/tracker");
const db = {} as McpContext["db"];
const ctx: McpContext = {
  db,
  teamId: "team-fixture",
  userId: "user-fixture",
  userEmail: null,
  scopes: [
    "tracker-projects.read",
    "tracker-projects.write",
    "tracker-entries.read",
    "tracker-entries.write",
  ],
  apiUrl: "https://api.example",
  timezone: "UTC",
  locale: "en",
  countryCode: null,
  dateFormat: null,
  timeFormat: 24,
};

beforeEach(() => {
  resolve.mockClear();
  update.mockClear();
  verify.mockClear();
  mocks.startTimer.mockClear();
  mocks.upsertTrackerEntries.mockClear();
});
describe("Linear connector and REST wiring", () => {
  test("MCP returns structured refs and forwards stable IDs with authenticated team context", async () => {
    const server = new McpServer({ name: "fixture", version: "1" });
    registerTrackerLinearTools(server, ctx);
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          {
            handler: (
              args: Record<string, unknown>,
            ) => Promise<{ structuredContent: unknown }>;
          }
        >;
      }
    )._registeredTools;
    const result = await tools.tracker_linear_issues_resolve!.handler({
      projectId,
      query: "Same title",
    });
    expect(result.structuredContent).toMatchObject({
      data: { nodes: refs, requiresChoice: true },
    });
    expect(resolve).toHaveBeenCalledWith(
      db,
      ctx.teamId,
      ctx.userId,
      projectId,
      "Same title",
      undefined,
    );
    expect(
      (
        await tools.tracker_entry_linear_issues_set!.handler({
          entryId,
          issueIds: [issueId],
        })
      ).structuredContent,
    ).toEqual({ data: refs });
    expect(update).toHaveBeenCalledWith(db, ctx.teamId, ctx.userId, entryId, [
      issueId,
    ]);
    await tools.tracker_entry_linear_issues_set!.handler({
      entryId,
      issueIds: [],
    });
    expect(update).toHaveBeenLastCalledWith(
      db,
      ctx.teamId,
      ctx.userId,
      entryId,
      [],
    );
  });

  test("timer authorization uses the caller, not an assigned user or forged verification payload", async () => {
    const params = {
      projectId,
      assignedId: entryId,
      linearIssueIds: [issueId],
      verifiedLinearIssues: [{ id: issueId, organizationId: projectId }],
    };
    const caller = createCallerFactory(trpcEntries)(createTestContext());
    await expect(caller.startTimer(params)).rejects.toThrow(
      "Your Linear account",
    );
    expect(verify).toHaveBeenLastCalledWith(
      expect.anything(),
      "test-team-id",
      "test-user-id",
      [issueId],
    );
    expect(mocks.startTimer).not.toHaveBeenCalled();
    const server = new McpServer({ name: "fixture-tracker", version: "1" });
    registerTrackerTools(server, ctx);
    const tool = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { handler: (args: typeof params) => Promise<{ isError?: boolean }> }
        >;
      }
    )._registeredTools.tracker_timer_start!;
    expect((await tool.handler(params)).isError).toBe(true);
    expect(verify).toHaveBeenLastCalledWith(
      db,
      ctx.teamId,
      ctx.userId,
      [issueId],
      undefined,
    );
    expect(mocks.startTimer).not.toHaveBeenCalled();
    const app = rest(["tracker-entries.write"]);
    app.route("/tracker-entries", restEntries);
    app.onError((error, c) => c.json({ error: error.message }, 400));
    const result = await app.request("/tracker-entries/timer/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    expect(result.status).toBe(400);
    expect(verify).toHaveBeenLastCalledWith(db, ctx.teamId, ctx.userId, [
      issueId,
    ]);
    expect(mocks.startTimer).not.toHaveBeenCalled();
  });

  function rest(scopes?: Scope[]) {
    const app = new OpenAPIHono<Context>();
    app.use("*", async (c, next) => {
      c.set("db", db);
      c.set("teamId", ctx.teamId);
      c.set("session", {
        user: { id: ctx.userId },
      } as Context["Variables"]["session"]);
      c.set("scopes", scopes);
      await next();
    });
    app.route("/tracker-linear", trackerLinearRouter);
    return app;
  }
  const writeRequest = (ids: string[]) => ({
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      issueIds: ids,
      teamId: "untrusted-team",
      userId: "untrusted-user",
    }),
  });

  test("REST rejects missing or insufficient scopes and malformed refs before writes", async () => {
    const path = `/tracker-linear/entries/${entryId}`;
    expect((await rest().request(path, writeRequest([issueId]))).status).toBe(
      401,
    );
    expect(
      (
        await rest(["tracker-entries.read"]).request(
          path,
          writeRequest([issueId]),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await rest(["tracker-entries.write"]).request(
          path,
          writeRequest(["FUR-10"]),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await rest(["tracker-entries.write"]).request(
          path,
          writeRequest(Array(51).fill(issueId)),
        )
      ).status,
    ).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  test("REST link edits use session team and preserve empty replacement semantics", async () => {
    const response = await rest(["tracker-entries.write"]).request(
      `/tracker-linear/entries/${entryId}`,
      writeRequest([]),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(refs);
    expect(update).toHaveBeenCalledWith(
      db,
      ctx.teamId,
      ctx.userId,
      entryId,
      [],
    );
  });
});
