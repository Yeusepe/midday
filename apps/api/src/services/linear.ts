import { createHash, randomBytes } from "node:crypto";
import type { Database } from "@midday/db/client";
import {
  getTrackerEntryById,
  setTrackerLinearIssues,
} from "@midday/db/queries";
import {
  type LinearIssueDetails,
  type LinearIssueRef,
  linearConnections,
  trackerProjects,
} from "@midday/db/schema";
import {
  decrypt,
  decryptOAuthState,
  encrypt,
  encryptOAuthState,
} from "@midday/encryption";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  issueRef,
  LinearClient,
  LinearRequestError,
  parseLinearReferences,
} from "./linear-client";

const credentialsSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
});
const configSchema = z.object({
  teamId: z.string(),
  userId: z.string(),
  organizationId: z.string().uuid(),
  organizationName: z.string(),
  organizationUrlKey: z.string(),
  credentials: credentialsSchema,
  lastStateId: z.string(),
  refreshUncertain: z.boolean().optional(),
});
const stateSchema = z.object({
  provider: z.literal("linear"),
  teamId: z.string(),
  userId: z.string(),
  expiresAt: z.number(),
  nonce: z.string(),
  verifier: z.string(),
});
const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().positive(),
  scope: z.union([z.string(), z.array(z.string())]),
});
const connectionWhere = (teamId: string, userId: string) =>
  and(
    eq(linearConnections.teamId, teamId),
    eq(linearConnections.userId, userId),
  );
function decodeConfig(encrypted: string, teamId: string, userId: string) {
  const config = configSchema.parse(JSON.parse(decrypt(encrypted)));
  if (config.teamId !== teamId || config.userId !== userId)
    throw new Error("Invalid Linear connection owner");
  return config;
}
export const linearConfigured = () =>
  !!(
    process.env.LINEAR_CLIENT_ID &&
    process.env.LINEAR_CLIENT_SECRET &&
    process.env.LINEAR_REDIRECT_URI &&
    process.env.MIDDAY_ENCRYPTION_KEY
  );

async function revokeCredentials(
  credentials: z.infer<typeof credentialsSchema>,
) {
  // Revoke both members of the current pair. Invalid/already revoked credentials
  // are terminal per Linear's documented 400/401 responses; outages are not.
  for (const [hint, token] of [
    ["refresh_token", credentials.refreshToken],
    ["access_token", credentials.accessToken],
  ]) {
    let response: Response;
    try {
      response = await fetch("https://api.linear.app/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: token!, token_type_hint: hint! }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error(
        "Linear access is disabled here, but revocation could not be confirmed. Retry disconnecting.",
      );
    }
    if (![200, 400, 401].includes(response.status))
      throw new Error(
        "Linear access is disabled here, but revocation could not be confirmed. Retry disconnecting.",
      );
  }
}

async function exchangeToken(params: Record<string, string>) {
  const response = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.LINEAR_CLIENT_ID!,
      client_secret: process.env.LINEAR_CLIENT_SECRET!,
      ...params,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new LinearRequestError(
      "Linear authorization failed. Reconnect Linear and try again.",
      response.status === 400 || response.status === 401 ? 401 : 503,
    );
  const tokens = tokenSchema.parse(await response.json());
  const credentials = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  const scopes =
    typeof tokens.scope === "string"
      ? tokens.scope.split(/[ ,]+/).filter(Boolean)
      : tokens.scope;
  if (!scopes.includes("read") || scopes.some((scope) => scope !== "read")) {
    await revokeCredentials(credentials);
    throw new Error(
      "Linear granted more than read-only access. Revoke this authorization in Linear and connect with read access only.",
    );
  }
  return credentials;
}

export function beginLinearConnection(teamId: string, userId: string) {
  if (!linearConfigured())
    throw new Error("Linear OAuth is not configured on this server");
  const verifier = randomBytes(32).toString("base64url");
  const state = encryptOAuthState({
    provider: "linear",
    teamId,
    userId,
    expiresAt: Date.now() + 10 * 60_000,
    nonce: randomBytes(32).toString("hex"),
    verifier,
  });
  const url = new URL("https://linear.app/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: process.env.LINEAR_CLIENT_ID!,
    redirect_uri: process.env.LINEAR_REDIRECT_URI!,
    response_type: "code",
    scope: "read",
    actor: "user",
    prompt: "consent",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return { url: url.toString() };
}

export async function completeLinearConnection(
  db: Database,
  teamId: string,
  userId: string,
  code: string,
  encryptedState: string,
) {
  const parsed = stateSchema.safeParse(decryptOAuthState(encryptedState));
  if (
    !parsed.success ||
    parsed.data.teamId !== teamId ||
    parsed.data.userId !== userId ||
    parsed.data.expiresAt < Date.now()
  )
    throw new Error(
      "Invalid or expired Linear authorization. Start connecting again.",
    );
  const state = parsed.data;
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`linear:${teamId}:${userId}`}, 0))`,
    );
    const [existing] = await tx
      .select()
      .from(linearConnections)
      .where(connectionWhere(teamId, userId))
      .for("update");
    if (existing?.revocationPending)
      throw new Error(
        "Finish disconnecting your old Linear connection before reconnecting.",
      );
    if (existing) {
      const config = decodeConfig(existing.encryptedConfig, teamId, userId);
      if (config.lastStateId === state.nonce) return;
      if (config.refreshUncertain)
        throw new Error(
          "Disconnect your existing Linear connection before reconnecting so its current credentials can be revoked.",
        );
      // Do not leave a previous authorization active when replacing a connection.
      await revokeCredentials(config.credentials);
    }
    const credentials = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.LINEAR_REDIRECT_URI!,
      code_verifier: state.verifier,
    });
    let organization: Awaited<
      ReturnType<LinearClient["organization"]>
    >["organization"];
    try {
      organization = (
        await new LinearClient(credentials.accessToken).organization()
      ).organization;
    } catch (error) {
      await revokeCredentials(credentials);
      throw error;
    }
    const encryptedConfig = encrypt(
      JSON.stringify({
        teamId,
        userId,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationUrlKey: organization.urlKey,
        credentials,
        lastStateId: state.nonce,
      }),
    );
    await tx
      .insert(linearConnections)
      .values({ teamId, userId, encryptedConfig })
      .onConflictDoUpdate({
        target: [linearConnections.teamId, linearConnections.userId],
        set: { encryptedConfig, revocationPending: false },
      });
  });
  return linearConnectionStatus(db, teamId, userId);
}

export async function linearConnectionStatus(
  db: Database,
  teamId: string,
  userId: string,
) {
  const [row] = await db
    .select()
    .from(linearConnections)
    .where(connectionWhere(teamId, userId));
  const config =
    row && !row.revocationPending
      ? decodeConfig(row.encryptedConfig, teamId, userId)
      : null;
  return {
    configured: linearConfigured(),
    connected: !!config,
    revocationPending: row?.revocationPending ?? false,
    organization: config
      ? { id: config.organizationId, name: config.organizationName }
      : null,
  };
}

export async function disconnectLinear(
  db: Database,
  teamId: string,
  userId: string,
) {
  const row = await db.transaction(async (tx) => {
    // Serialize against token refresh so we revoke the latest committed pair.
    const [current] = await tx
      .select()
      .from(linearConnections)
      .where(connectionWhere(teamId, userId))
      .for("update");
    if (!current) return null;
    await tx
      .update(linearConnections)
      .set({ revocationPending: true })
      .where(connectionWhere(teamId, userId));
    return current;
  });
  if (!row) return { connected: false, revocationPending: false };
  let encryptedConfig = row.encryptedConfig;
  const config = decodeConfig(encryptedConfig, teamId, userId);
  // A lost refresh response may have rotated the provider's tokens. Recover
  // that pair before revocation instead of trusting a historical access token.
  if (config.refreshUncertain) {
    await db.transaction(async (tx) => {
      const [latest] = await tx
        .select()
        .from(linearConnections)
        .where(connectionWhere(teamId, userId))
        .for("update");
      if (!latest) return;
      const current = decodeConfig(latest.encryptedConfig, teamId, userId);
      if (current.refreshUncertain) {
        try {
          current.credentials = await exchangeToken({
            grant_type: "refresh_token",
            refresh_token: current.credentials.refreshToken,
          });
        } catch (error) {
          if (error instanceof LinearRequestError && error.status === 401)
            throw new Error(
              "Revocation could not be confirmed. Revoke this app in Linear under Security & Access > Authorized applications. This connection remains disabled.",
            );
          throw error;
        }
        current.refreshUncertain = false;
        encryptedConfig = encrypt(JSON.stringify(current));
        await tx
          .update(linearConnections)
          .set({ encryptedConfig })
          .where(connectionWhere(teamId, userId));
      } else encryptedConfig = latest.encryptedConfig;
    });
  }
  await revokeCredentials(
    decodeConfig(encryptedConfig, teamId, userId).credentials,
  );
  await db
    .delete(linearConnections)
    .where(
      and(
        connectionWhere(teamId, userId),
        eq(linearConnections.encryptedConfig, encryptedConfig),
      ),
    );
  return { connected: false, revocationPending: false };
}

async function linearCredentials(
  db: Database,
  teamId: string,
  userId: string,
  rejectedToken?: string,
) {
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(linearConnections)
      .where(connectionWhere(teamId, userId))
      .for("update");
    if (!row || row.revocationPending)
      throw new Error("Connect your own Linear account first");
    const config = decodeConfig(row.encryptedConfig, teamId, userId);
    if (
      config.refreshUncertain ||
      config.credentials.expiresAt <= Date.now() + 60_000 ||
      config.credentials.accessToken === rejectedToken
    ) {
      try {
        config.credentials = await exchangeToken({
          grant_type: "refresh_token",
          refresh_token: config.credentials.refreshToken,
        });
        config.refreshUncertain = false;
      } catch (error) {
        // Commit the uncertainty marker even though the provider call failed.
        // Reads and disconnect will recover the pair before using it again.
        // An invalid old token does not prove a previously lost rotation was
        // revoked, especially after Linear's refresh-recovery window expires.
        config.refreshUncertain =
          config.refreshUncertain ||
          !(error instanceof LinearRequestError && error.status === 401);
        await tx
          .update(linearConnections)
          .set({ encryptedConfig: encrypt(JSON.stringify(config)) })
          .where(connectionWhere(teamId, userId));
        return { error };
      }
      await tx
        .update(linearConnections)
        .set({ encryptedConfig: encrypt(JSON.stringify(config)) })
        .where(connectionWhere(teamId, userId));
    }
    return { config };
  });
  if ("error" in result) throw result.error;
  return result.config;
}
async function withLinear<T>(
  db: Database,
  teamId: string,
  userId: string,
  operation: (
    client: LinearClient,
    config: z.infer<typeof configSchema>,
  ) => Promise<T>,
): Promise<T> {
  const current = await linearCredentials(db, teamId, userId);
  try {
    return await operation(
      new LinearClient(current.credentials.accessToken),
      current,
    );
  } catch (error) {
    if (!(error instanceof LinearRequestError) || error.status !== 401)
      throw error;
    const refreshed = await linearCredentials(
      db,
      teamId,
      userId,
      current.credentials.accessToken,
    );
    return operation(
      new LinearClient(refreshed.credentials.accessToken),
      refreshed,
    );
  }
}

export async function searchLinearProjects(
  db: Database,
  teamId: string,
  userId: string,
  query?: string,
  after?: string,
) {
  return withLinear(db, teamId, userId, async (client, config) => {
    const { projects } = await client.projects(query, after);
    return {
      ...projects,
      nodes: projects.nodes.map((project) => ({
        ...project,
        organizationId: config.organizationId,
      })),
    };
  });
}
async function trackerProject(db: Database, teamId: string, projectId: string) {
  const project = await db.query.trackerProjects.findFirst({
    where: and(
      eq(trackerProjects.id, projectId),
      eq(trackerProjects.teamId, teamId),
    ),
  });
  if (!project) throw new Error("Tracker project not found");
  return project;
}
export async function linkLinearProject(
  db: Database,
  teamId: string,
  userId: string,
  projectId: string,
  linearProjectId: string | null,
) {
  await trackerProject(db, teamId, projectId);
  const linearProject = linearProjectId
    ? await withLinear(db, teamId, userId, async (client, config) => ({
        id: (await client.project(linearProjectId)).project.id,
        organizationId: config.organizationId,
      }))
    : null;
  await db
    .update(trackerProjects)
    .set({ linearProject })
    .where(
      and(
        eq(trackerProjects.id, projectId),
        eq(trackerProjects.teamId, teamId),
      ),
    );
  return { linearProject };
}
export async function getLinkedLinearProject(
  db: Database,
  teamId: string,
  userId: string,
  projectId: string,
) {
  const { linearProject } = await trackerProject(db, teamId, projectId);
  if (!linearProject) return null;
  try {
    return await withLinear(db, teamId, userId, async (client, config) => {
      if (config.organizationId !== linearProject.organizationId) return null;
      return {
        ...(await client.project(linearProject.id)).project,
        organizationId: config.organizationId,
      };
    });
  } catch {
    return null;
  }
}
export async function searchLinearIssues(
  db: Database,
  teamId: string,
  userId: string,
  projectId: string,
  query = "",
  after?: string,
) {
  const { linearProject } = await trackerProject(db, teamId, projectId);
  if (!linearProject)
    throw new Error("Link this tracker project to a Linear project first");
  return withLinear(db, teamId, userId, async (client, config) => {
    if (linearProject.organizationId !== config.organizationId)
      throw new Error(
        "Connect your Linear account in this project's workspace",
      );
    const references = parseLinearReferences(query, config.organizationUrlKey);
    let issues: LinearIssueDetails[] = [];
    let pageInfo = { hasNextPage: false, endCursor: null as string | null };
    if (references) {
      for (const id of references)
        issues.push(
          issueRef((await client.issue(id)).issue, config.organizationId),
        );
    } else {
      const result = await client.issues(linearProject.id, query, after);
      issues = result.issues.nodes.map((issue) =>
        issueRef(issue, config.organizationId),
      );
      pageInfo = result.issues.pageInfo;
    }
    // Search results are deliberately not persisted.
    return {
      nodes: [...new Map(issues.map((issue) => [issue.id, issue])).values()],
      pageInfo,
      exact: !!references,
      requiresChoice:
        !references ||
        issues.some((issue) => issue.projectId !== linearProject.id),
    };
  });
}
function unavailable(ref: LinearIssueRef): LinearIssueDetails {
  return {
    ...ref,
    identifier: null,
    title: null,
    url: null,
    linearTeamId: null,
    projectId: null,
    updatedAt: null,
    archivedAt: null,
    unavailable: true,
  };
}
async function hydrateRefs(
  db: Database,
  teamId: string,
  userId: string,
  refs: LinearIssueRef[],
): Promise<LinearIssueDetails[]> {
  if (!refs.length) return [];
  try {
    return await withLinear(db, teamId, userId, async (client, config) => {
      const details: LinearIssueDetails[] = [];
      for (const ref of refs) {
        if (ref.organizationId !== config.organizationId) {
          details.push(unavailable(ref));
          continue;
        }
        try {
          details.push(
            issueRef((await client.issue(ref.id)).issue, config.organizationId),
          );
        } catch (error) {
          if (error instanceof LinearRequestError && error.status === 401)
            throw error;
          details.push(unavailable(ref));
        }
      }
      return details;
    });
  } catch {
    return refs.map(unavailable);
  }
}
export async function refreshLinearIssues(
  db: Database,
  teamId: string,
  userId: string,
  issueIds: string[],
) {
  const status = await linearConnectionStatus(db, teamId, userId);
  if (!status.connected || !status.organization)
    throw new Error("Connect your own Linear account first");
  return hydrateRefs(
    db,
    teamId,
    userId,
    [...new Set(issueIds)].map((id) => ({
      id,
      organizationId: status.organization!.id,
    })),
  );
}

// Public create/update/timer routes must call this with the authenticated user,
// independently of who is assigned to the time entry. Retained links can be
// removed without requiring continuing access to a private Linear issue.
export async function verifyLinearIssueLinks(
  db: Database,
  teamId: string,
  userId: string,
  issueIds?: string[],
  entryId?: string,
): Promise<LinearIssueRef[]> {
  if (!issueIds?.length) return [];
  const entry = entryId
    ? await getTrackerEntryById(db, { teamId, id: entryId })
    : null;
  if (entryId && !entry) throw new Error("Time entry not found");
  const retained = new Set(entry?.linearIssues.map((issue) => issue.id));
  const additions = [...new Set(issueIds)].filter((id) => !retained.has(id));
  if (!additions.length) return [];
  return withLinear(db, teamId, userId, async (client, config) => {
    const verified: LinearIssueRef[] = [];
    for (const id of additions) {
      const { issue } = await client.issue(id);
      if (issue.id !== id)
        throw new Error("Use the stable issue UUID returned by Linear");
      verified.push({ id, organizationId: config.organizationId });
    }
    return verified;
  });
}
export async function updateEntryLinearIssues(
  db: Database,
  teamId: string,
  userId: string,
  entryId: string,
  issueIds: string[],
) {
  const verified = await verifyLinearIssueLinks(
    db,
    teamId,
    userId,
    issueIds,
    entryId,
  );
  const refs = await db.transaction((tx) =>
    setTrackerLinearIssues(tx, teamId, entryId, issueIds, verified),
  );
  return hydrateRefs(db, teamId, userId, refs);
}
export async function getEntryLinearIssues(
  db: Database,
  teamId: string,
  userId: string,
  entryId: string,
) {
  const entry = await getTrackerEntryById(db, { teamId, id: entryId });
  if (!entry) throw new Error("Time entry not found");
  return hydrateRefs(db, teamId, userId, entry.linearIssues);
}
