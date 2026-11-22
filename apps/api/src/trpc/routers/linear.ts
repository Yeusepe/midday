import {
  linearEntryLinkSchema,
  linearIssueIdsSchema,
  linearIssueSearchSchema,
  linearProjectLinkSchema,
  linearSearchSchema,
} from "@api/schemas/linear";
import {
  beginLinearConnection,
  completeLinearConnection,
  disconnectLinear,
  getEntryLinearIssues,
  getLinkedLinearProject,
  linearConnectionStatus,
  linkLinearProject,
  refreshLinearIssues,
  searchLinearIssues,
  searchLinearProjects,
  updateEntryLinearIssues,
} from "@api/services/linear";
import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import { z } from "zod";

export const linearRouter = createTRPCRouter({
  connection: protectedProcedure.query(({ ctx }) =>
    linearConnectionStatus(ctx.db, ctx.teamId!, ctx.session.user.id),
  ),
  connect: protectedProcedure.mutation(({ ctx }) =>
    beginLinearConnection(ctx.teamId!, ctx.session.user.id),
  ),
  complete: protectedProcedure
    .input(
      z.object({ code: z.string().max(2048), state: z.string().max(8192) }),
    )
    .mutation(({ ctx, input }) =>
      completeLinearConnection(
        ctx.db,
        ctx.teamId!,
        ctx.session.user.id,
        input.code,
        input.state,
      ),
    ),
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    return disconnectLinear(ctx.db, ctx.teamId!, ctx.session.user.id);
  }),
  project: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      getLinkedLinearProject(
        ctx.db,
        ctx.teamId!,
        ctx.session.user.id,
        input.projectId,
      ),
    ),
  projects: protectedProcedure
    .input(linearSearchSchema)
    .query(({ ctx, input }) =>
      searchLinearProjects(
        ctx.db,
        ctx.teamId!,
        ctx.session.user.id,
        input.query,
        input.after,
      ),
    ),
  linkProject: protectedProcedure
    .input(linearProjectLinkSchema)
    .mutation(({ ctx, input }) =>
      linkLinearProject(
        ctx.db,
        ctx.teamId!,
        ctx.session.user.id,
        input.projectId,
        input.linearProjectId,
      ),
    ),
  issues: protectedProcedure
    .input(linearIssueSearchSchema)
    .query(({ ctx, input }) =>
      searchLinearIssues(
        ctx.db,
        ctx.teamId!,
        ctx.session.user.id,
        input.projectId,
        input.query,
        input.after,
      ),
    ),
  entryIssues: protectedProcedure
    .input(z.object({ entryId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      getEntryLinearIssues(
        ctx.db,
        ctx.teamId!,
        ctx.session.user.id,
        input.entryId,
      ),
    ),
  setEntryIssues: protectedProcedure
    .input(linearEntryLinkSchema)
    .mutation(({ ctx, input }) =>
      updateEntryLinearIssues(
        ctx.db,
        ctx.teamId!,
        ctx.session.user.id,
        input.entryId,
        input.issueIds,
      ),
    ),
  refresh: protectedProcedure
    .input(z.object({ issueIds: linearIssueIdsSchema }))
    .mutation(({ ctx, input }) =>
      refreshLinearIssues(
        ctx.db,
        ctx.teamId!,
        ctx.session.user.id,
        input.issueIds,
      ),
    ),
});
