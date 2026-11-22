import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseOrTransaction } from "../client";
import type { LinearIssueRef } from "../linear-types";
import {
  linearIssues,
  trackerEntries,
  trackerEntryLinearIssues,
} from "../schema";

export const linearIssueRelations = {
  linearIssueLinks: { with: { issue: true } },
} as const;

export function withLinearIssues<
  T extends { linearIssueLinks?: { issue: LinearIssueRef }[] },
>(entry: T) {
  const { linearIssueLinks, ...rest } = entry;
  return {
    ...rest,
    linearIssues: (linearIssueLinks ?? []).map(({ issue }) => ({
      id: issue.id,
      organizationId: issue.organizationId,
    })),
  };
}

// Call inside the entry transaction. verifiedIssues comes only from the API's
// live authorization check, never from request JSON or a shared issue cache.
export async function setTrackerLinearIssues(
  db: DatabaseOrTransaction,
  teamId: string,
  entryId: string,
  issueIds: string[],
  verifiedIssues: LinearIssueRef[] = [],
) {
  const [entry] = await db
    .select({ id: trackerEntries.id })
    .from(trackerEntries)
    .where(
      and(eq(trackerEntries.id, entryId), eq(trackerEntries.teamId, teamId)),
    )
    .for("update");
  if (!entry) throw new Error("Time entry not found");
  const existing = await db
    .select()
    .from(trackerEntryLinearIssues)
    .where(
      and(
        eq(trackerEntryLinearIssues.teamId, teamId),
        eq(trackerEntryLinearIssues.entryId, entryId),
      ),
    );
  const ids = [...new Set(issueIds)];
  const retained = new Set(existing.map((row) => row.issueId));
  const verified = new Map(verifiedIssues.map((issue) => [issue.id, issue]));
  for (const id of ids.filter((id) => !retained.has(id)).sort()) {
    const ref = verified.get(id);
    if (!ref)
      throw new Error(
        "Verify new tickets using your own Linear connection before linking them",
      );
    await db
      .insert(linearIssues)
      .values({ teamId, id: ref.id, organizationId: ref.organizationId })
      .onConflictDoNothing();
  }
  await db
    .delete(trackerEntryLinearIssues)
    .where(
      and(
        eq(trackerEntryLinearIssues.teamId, teamId),
        eq(trackerEntryLinearIssues.entryId, entryId),
      ),
    );
  if (ids.length)
    await db
      .insert(trackerEntryLinearIssues)
      .values(ids.map((issueId) => ({ teamId, entryId, issueId })))
      .onConflictDoNothing();
  if (!ids.length) return [];
  return db
    .select({
      id: linearIssues.id,
      organizationId: linearIssues.organizationId,
    })
    .from(linearIssues)
    .where(and(eq(linearIssues.teamId, teamId), inArray(linearIssues.id, ids)));
}
