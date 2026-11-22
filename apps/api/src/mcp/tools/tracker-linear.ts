import {
  linearEntryLinkSchema,
  linearIssueIdsSchema,
  linearIssueSearchSchema,
  linearProjectLinkSchema,
  linearSearchSchema,
} from "@api/schemas/linear";
import {
  getEntryLinearIssues,
  getLinkedLinearProject,
  linearConnectionStatus,
  linkLinearProject,
  refreshLinearIssues,
  searchLinearIssues,
  searchLinearProjects,
  updateEntryLinearIssues,
} from "@api/services/linear";
import {
  hasScope,
  READ_ONLY_ANNOTATIONS,
  type RegisterTools,
  WRITE_ANNOTATIONS,
} from "../types";
import { withErrorHandling } from "../utils";

export const registerTrackerLinearTools: RegisterTools = (server, ctx) => {
  const { db, teamId, userId } = ctx;
  const output = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: { data },
  });
  if (hasScope(ctx, "tracker-projects.read")) {
    server.registerTool(
      "tracker_linear_project_get",
      {
        description:
          "Get the linked Linear project's live name and URL using your own Linear permissions. Returns null if inaccessible; Payments stores only its UUID.",
        inputSchema: linearProjectLinkSchema.pick({ projectId: true }).shape,
        annotations: { ...READ_ONLY_ANNOTATIONS, openWorldHint: true },
      },
      withErrorHandling(
        async ({ projectId }) =>
          output(await getLinkedLinearProject(db, teamId, userId, projectId)),
        "Could not read Linear project",
      ),
    );

    server.registerTool(
      "tracker_linear_connection",
      {
        description:
          "Check your personal Linear connection. Connect from a tracker project's Linear section in the dashboard.",
        inputSchema: {},
        annotations: READ_ONLY_ANNOTATIONS,
      },
      withErrorHandling(
        async () => output(await linearConnectionStatus(db, teamId, userId)),
        "Could not read Linear connection",
      ),
    );
    server.registerTool(
      "tracker_linear_projects",
      {
        description:
          "Find Linear projects using your own Linear permissions. Paginate with after; present duplicate names for explicit user choice before linking.",
        inputSchema: linearSearchSchema.shape,
        annotations: { ...READ_ONLY_ANNOTATIONS, openWorldHint: true },
      },
      withErrorHandling(
        async ({ query, after }) =>
          output(await searchLinearProjects(db, teamId, userId, query, after)),
        "Could not search Linear projects",
      ),
    );
  }
  if (hasScope(ctx, "tracker-projects.write"))
    server.registerTool(
      "tracker_linear_project_link",
      {
        description:
          "Connect a tracker project to a chosen stable Linear project UUID. null unlinks; existing entry tickets, descriptions, hours and billing are preserved.",
        inputSchema: linearProjectLinkSchema.shape,
        annotations: {
          ...WRITE_ANNOTATIONS,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      withErrorHandling(
        async ({ projectId, linearProjectId }) =>
          output(
            await linkLinearProject(
              db,
              teamId,
              userId,
              projectId,
              linearProjectId,
            ),
          ),
        "Could not link Linear project",
      ),
    );
  if (hasScope(ctx, "tracker-entries.read")) {
    server.registerTool(
      "tracker_linear_issues_resolve",
      {
        description:
          "Resolve pasted Linear issue IDs/URLs (comma or whitespace separated), or search titles in the tracker project's linked Linear project. Empty query suggests issues. If requiresChoice is true, ask the user to select; never guess ambiguous matches. Use returned stable issue UUIDs with linearIssueIds on tracker writes or tracker_entry_linear_issues_set. Keep ticket metadata out of invoice descriptions.",
        inputSchema: linearIssueSearchSchema.shape,
        annotations: { ...READ_ONLY_ANNOTATIONS, openWorldHint: true },
      },
      withErrorHandling(
        async ({ projectId, query, after }) =>
          output(
            await searchLinearIssues(
              db,
              teamId,
              userId,
              projectId,
              query,
              after,
            ),
          ),
        "Could not resolve Linear issues",
      ),
    );
    server.registerTool(
      "tracker_entry_linear_issues_get",
      {
        description:
          "Read structured internal Linear ticket references on an existing entry or running timer.",
        inputSchema: linearEntryLinkSchema.pick({ entryId: true }).shape,
        annotations: READ_ONLY_ANNOTATIONS,
      },
      withErrorHandling(
        async ({ entryId }) =>
          output(await getEntryLinearIssues(db, teamId, userId, entryId)),
        "Could not read ticket links",
      ),
    );
  }
  if (hasScope(ctx, "tracker-entries.write")) {
    server.registerTool(
      "tracker_entry_linear_issues_set",
      {
        description:
          "Replace an entry's internal ticket links with resolved stable UUIDs. Read current links first to preserve others when adding/removing. [] removes all. Safe to retry; changes no description, time, billing or invoice totals. Works on running and invoiced entries.",
        inputSchema: linearEntryLinkSchema.shape,
        annotations: { ...WRITE_ANNOTATIONS, idempotentHint: true },
      },
      withErrorHandling(
        async ({ entryId, issueIds }) =>
          output(
            await updateEntryLinearIssues(
              db,
              teamId,
              userId,
              entryId,
              issueIds,
            ),
          ),
        "Could not update ticket links",
      ),
    );
    server.registerTool(
      "tracker_linear_issues_refresh",
      {
        description:
          "Fetch current issue details by stable UUID under your own Linear permissions, including renamed or moved issues. Safe to retry; preserves all links and financial data. Unavailable issues return opaque references without private details. Metadata is fetched live and is not cached in Payments.",
        inputSchema: { issueIds: linearIssueIdsSchema },
        annotations: {
          ...WRITE_ANNOTATIONS,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      withErrorHandling(
        async ({ issueIds }) =>
          output(await refreshLinearIssues(db, teamId, userId, issueIds)),
        "Could not refresh Linear metadata",
      ),
    );
  }
};
