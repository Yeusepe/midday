import { beforeEach, expect, test } from "bun:test";
import { trackerProjectsRouter } from "../../rest/routers/tracker-projects";
import { createTestApp } from "../helpers";
import { mocks } from "../setup";

const projectId = "11111111-1111-4111-8111-111111111111";
const project = {
  id: projectId,
  name: "Fixture project",
  description: null,
  status: "in_progress",
  estimate: null,
  currency: "USD",
  createdAt: "2026-11-23T00:00:00Z",
  totalDuration: 3600,
  totalAmount: 100,
  billable: true,
  customer: null,
  tags: [],
  users: [],
};
const app = createTestApp();
app.use("*", async (c, next) => {
  c.set("scopes", ["tracker-projects.read", "tracker-projects.write"]);
  await next();
});
app.route("/tracker-projects", trackerProjectsRouter);

beforeEach(() => {
  mocks.upsertTrackerProject.mockReset();
  mocks.upsertTrackerProject.mockImplementation(() => project);
  mocks.getTrackerProjects.mockImplementation(() => ({
    data: [project],
    meta: { hasNextPage: false, hasPreviousPage: false },
  }));
});

test("REST project list includes the saved billing setting", async () => {
  const response = await app.request("/tracker-projects");
  expect(response.status).toBe(200);
  expect((await response.json()).data[0].billable).toBe(true);
});

test("REST updates preserve omitted billing and return its saved value", async () => {
  const response = await app.request(`/tracker-projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Renamed project" }),
  });
  expect(response.status).toBe(200);
  expect(mocks.upsertTrackerProject.mock.calls[0]![1]).not.toHaveProperty(
    "billable",
  );
  expect((await response.json()).billable).toBe(true);
});
