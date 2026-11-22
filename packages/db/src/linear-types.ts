// Only these opaque identifiers are persisted with projects and entries.
export type LinearProjectRef = { id: string; organizationId: string };
export type LinearIssueRef = { id: string; organizationId: string };

// Live details are fetched under the requesting user's Linear authorization.
export type LinearProjectDetails = LinearProjectRef & {
  name: string;
  url: string;
};
export type LinearIssueDetails = LinearIssueRef & {
  identifier: string | null;
  title: string | null;
  url: string | null;
  linearTeamId: string | null;
  projectId: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
  unavailable?: boolean;
};
