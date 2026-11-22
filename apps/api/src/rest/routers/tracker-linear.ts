import { withRequiredScope } from "@api/rest/middleware";
import type { Context } from "@api/rest/types";
import {
  linearEntryLinkSchema,
  linearIssueDetailsSchema,
  linearIssueIdsSchema,
  linearIssueSearchSchema,
  linearPageInfoSchema,
  linearProjectDetailsSchema,
  linearProjectLinkSchema,
  linearProjectRefSchema,
  linearSearchSchema,
} from "@api/schemas/linear";
import {
  getEntryLinearIssues,
  getLinkedLinearProject,
  linkLinearProject,
  refreshLinearIssues,
  searchLinearIssues,
  searchLinearProjects,
  updateEntryLinearIssues,
} from "@api/services/linear";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const app = new OpenAPIHono<Context>();
app.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});
const response = (schema: z.ZodType) => ({
  200: { description: "Success", content: { "application/json": { schema } } },
});
const tags = ["Tracker Linear"];

app.openapi(
  createRoute({
    method: "get",
    path: "/project",
    operationId: "getLinkedLinearProject",
    summary:
      "Read the linked project's live details with your Linear permissions",
    tags,
    request: { query: linearProjectLinkSchema.pick({ projectId: true }) },
    responses: response(linearProjectDetailsSchema.nullable()),
    middleware: [withRequiredScope("tracker-projects.read")],
  }),
  async (c) =>
    c.json(
      await getLinkedLinearProject(
        c.get("db"),
        c.get("teamId"),
        c.get("session").user.id,
        c.req.valid("query").projectId,
      ),
    ),
);

app.openapi(
  createRoute({
    method: "get",
    path: "/projects",
    operationId: "searchLinearProjects",
    summary: "Find Linear projects",
    tags,
    request: { query: linearSearchSchema },
    responses: response(
      z.object({
        nodes: z.array(linearProjectDetailsSchema),
        pageInfo: linearPageInfoSchema,
      }),
    ),
    middleware: [withRequiredScope("tracker-projects.read")],
  }),
  async (c) => {
    const { query, after } = c.req.valid("query");
    return c.json(
      await searchLinearProjects(
        c.get("db"),
        c.get("teamId"),
        c.get("session").user.id,
        query,
        after,
      ),
    );
  },
);
app.openapi(
  createRoute({
    method: "put",
    path: "/project",
    operationId: "linkLinearProject",
    summary: "Link or unlink a Linear project",
    tags,
    request: {
      body: {
        content: { "application/json": { schema: linearProjectLinkSchema } },
      },
    },
    responses: response(
      z.object({ linearProject: linearProjectRefSchema.nullable() }),
    ),
    middleware: [withRequiredScope("tracker-projects.write")],
  }),
  async (c) => {
    const { projectId, linearProjectId } = c.req.valid("json");
    return c.json(
      await linkLinearProject(
        c.get("db"),
        c.get("teamId"),
        c.get("session").user.id,
        projectId,
        linearProjectId,
      ),
    );
  },
);
app.openapi(
  createRoute({
    method: "get",
    path: "/issues",
    operationId: "resolveLinearIssues",
    summary: "Resolve IDs/URLs or suggest issues in the linked project",
    tags,
    request: { query: linearIssueSearchSchema },
    responses: response(
      z.object({
        nodes: z.array(linearIssueDetailsSchema),
        pageInfo: linearPageInfoSchema,
        exact: z.boolean(),
        requiresChoice: z.boolean(),
      }),
    ),
    middleware: [withRequiredScope("tracker-entries.read")],
  }),
  async (c) => {
    const { projectId, query, after } = c.req.valid("query");
    return c.json(
      await searchLinearIssues(
        c.get("db"),
        c.get("teamId"),
        c.get("session").user.id,
        projectId,
        query,
        after,
      ),
    );
  },
);
app.openapi(
  createRoute({
    method: "get",
    path: "/entries/{entryId}",
    operationId: "getEntryLinearIssues",
    summary: "Read an entry's internal ticket references",
    tags,
    request: { params: linearEntryLinkSchema.pick({ entryId: true }) },
    responses: response(z.array(linearIssueDetailsSchema)),
    middleware: [withRequiredScope("tracker-entries.read")],
  }),
  async (c) =>
    c.json(
      await getEntryLinearIssues(
        c.get("db"),
        c.get("teamId"),
        c.get("session").user.id,
        c.req.valid("param").entryId,
      ),
    ),
);
app.openapi(
  createRoute({
    method: "put",
    path: "/entries/{entryId}",
    operationId: "setEntryLinearIssues",
    summary: "Replace only ticket links, preserving time and billing",
    tags,
    request: {
      params: linearEntryLinkSchema.pick({ entryId: true }),
      body: {
        content: {
          "application/json": {
            schema: z.object({ issueIds: linearIssueIdsSchema }),
          },
        },
      },
    },
    responses: response(z.array(linearIssueDetailsSchema)),
    middleware: [withRequiredScope("tracker-entries.write")],
  }),
  async (c) =>
    c.json(
      await updateEntryLinearIssues(
        c.get("db"),
        c.get("teamId"),
        c.get("session").user.id,
        c.req.valid("param").entryId,
        c.req.valid("json").issueIds,
      ),
    ),
);
app.openapi(
  createRoute({
    method: "post",
    path: "/refresh",
    operationId: "refreshLinearIssues",
    summary: "Fetch current ticket details using your own Linear permissions",
    tags,
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ issueIds: linearIssueIdsSchema }),
          },
        },
      },
    },
    responses: response(z.array(linearIssueDetailsSchema)),
    middleware: [withRequiredScope("tracker-entries.write")],
  }),
  async (c) =>
    c.json(
      await refreshLinearIssues(
        c.get("db"),
        c.get("teamId"),
        c.get("session").user.id,
        c.req.valid("json").issueIds,
      ),
    ),
);

export { app as trackerLinearRouter };
