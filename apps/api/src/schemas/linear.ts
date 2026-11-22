import { z } from "@hono/zod-openapi";

export const linearIssueRefSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
});
export const linearProjectRefSchema = linearIssueRefSchema;
export const linearProjectDetailsSchema = linearProjectRefSchema.extend({
  name: z.string(),
  url: z.string().url(),
});
export const linearIssueDetailsSchema = linearIssueRefSchema.extend({
  identifier: z.string().nullable(),
  title: z.string().nullable(),
  url: z.string().url().nullable(),
  linearTeamId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  updatedAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  unavailable: z.boolean().optional(),
});
export const linearIssueIdsSchema = z
  .array(z.string().uuid())
  .max(50)
  .describe(
    "Stable Linear issue UUIDs returned by issue resolution/search. Omit to preserve links; [] removes all links. Internal metadata, never invoice text.",
  );
export const linearSearchSchema = z.object({
  query: z.string().max(500).optional(),
  after: z.string().max(512).optional(),
});
export const linearIssueSearchSchema = linearSearchSchema.extend({
  query: z.string().max(10000).optional(),
  projectId: z.string().uuid(),
});
export const linearProjectLinkSchema = z.object({
  projectId: z.string().uuid(),
  linearProjectId: z.string().uuid().nullable(),
});
export const linearEntryLinkSchema = z.object({
  entryId: z.string().uuid(),
  issueIds: linearIssueIdsSchema,
});
export const linearPageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});
