import "../setup";
import { beforeEach, expect, test } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTrackerTools } from "../../mcp/tools/tracker";
import type { McpContext } from "../../mcp/types";
import { mocks } from "../setup";

const projectId = "11111111-1111-4111-8111-111111111111";
const server = new McpServer({ name: "billing-fixture", version: "1" });
registerTrackerTools(server, {
  db: {},
  teamId: "test-team-id",
  userId: "test-user-id",
  scopes: ["tracker-projects.read", "tracker-projects.write"],
} as McpContext);
const update = (server as any)._registeredTools.tracker_projects_update;

beforeEach(() => {
  mocks.getTrackerProjectById.mockImplementation(() => ({
    id: projectId,
    name: "Fixture project",
    billable: true,
    rate: 100,
    currency: "USD",
    tags: [],
  }));
  mocks.upsertTrackerProject.mockReset();
  mocks.upsertTrackerProject.mockImplementation((_, params) => params);
});

test("connector parsing and updating a project note preserves billing", async () => {
  // Parse through the registered tool schema: defaults apply before the handler.
  const input = update.inputSchema.parse({
    id: projectId,
    description: "Updated note",
  });
  expect(input.billable).toBeUndefined();
  const result = await update.handler(input);
  expect(result.isError).not.toBe(true);
  expect(mocks.upsertTrackerProject.mock.calls[0]![1]).toMatchObject({
    description: "Updated note",
    billable: true,
    rate: 100,
    currency: "USD",
  });
});

test.each([
  true,
  false,
])("connector can explicitly set billing to %s", async (billable) => {
  const input = update.inputSchema.parse({ id: projectId, billable });
  const result = await update.handler(input);
  expect(result.isError).not.toBe(true);
  expect(mocks.upsertTrackerProject.mock.calls[0]![1]).toMatchObject({
    billable,
  });
});
