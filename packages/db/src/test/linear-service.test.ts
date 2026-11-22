import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { decrypt, decryptOAuthState, encrypt } from "@midday/encryption";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import {
  beginLinearConnection,
  completeLinearConnection,
  disconnectLinear,
  getEntryLinearIssues,
  linearConnectionStatus,
  linkLinearProject,
  refreshLinearIssues,
  searchLinearIssues,
  searchLinearProjects,
  updateEntryLinearIssues,
  verifyLinearIssueLinks,
} from "../../../../apps/api/src/services/linear";
import type { Database } from "../client";
import { draftInvoiceFromTracker } from "../queries/invoices";
import {
  getTrackerEntryById,
  upsertTrackerEntries,
} from "../queries/tracker-entries";
import * as schema from "../schema";
import { fixtureTable } from "./helpers/linear-fixture";

const pg = new PGlite();
const database = drizzle(pg, { schema });
const db = database as unknown as Database;
const teamId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const orgId = "44444444-4444-4444-8444-444444444444";
const otherUser = "55555555-5555-4555-8555-555555555555";
const issue = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  identifier: "FUR-10",
  title: "Private issue title",
  url: "https://linear.app/fixture/issue/FUR-10/private-title",
  team: { id: teamId },
  project: { id: projectId },
  updatedAt: "2026-11-01T00:00:00.000Z",
  archivedAt: null,
};
const issueB = {
  ...issue,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  identifier: "FUR-20",
};
const originalFetch = globalThis.fetch;
const envKeys = [
  "LINEAR_CLIENT_ID",
  "LINEAR_CLIENT_SECRET",
  "LINEAR_REDIRECT_URI",
  "MIDDAY_ENCRYPTION_KEY",
] as const;
const originalEnv = envKeys.map((key) => process.env[key]);
const emptyProjects = {
  projects: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
};
function mockFetch(
  handler: (url: string, options: RequestInit) => Promise<Response> | Response,
) {
  globalThis.fetch = ((url, options) =>
    handler(String(url), options ?? {})) as typeof fetch;
}
const where = (user = userId) =>
  and(
    eq(schema.linearConnections.teamId, teamId),
    eq(schema.linearConnections.userId, user),
  );
function config(user = userId, expiresAt = Date.now() + 86400000) {
  return {
    teamId,
    userId: user,
    organizationId: orgId,
    organizationName: "Private org name",
    organizationUrlKey: "fixture",
    lastStateId: "fixture-state",
    credentials: {
      accessToken: `access-${user}`,
      refreshToken: `refresh-${user}`,
      expiresAt,
    },
  };
}
async function seed(user = userId, expiresAt?: number) {
  await database.insert(schema.linearConnections).values({
    teamId,
    userId: user,
    encryptedConfig: encrypt(JSON.stringify(config(user, expiresAt))),
  });
}
async function stored(user = userId) {
  const [row] = await database
    .select()
    .from(schema.linearConnections)
    .where(where(user));
  return row;
}
function tokens(
  access = "new-access",
  refresh = "new-refresh",
  scope = "read",
) {
  return Response.json({
    access_token: access,
    refresh_token: refresh,
    expires_in: 86400,
    scope,
  });
}
function liveIssues() {
  mockFetch((_url, options) => {
    const body = JSON.parse(String(options.body));
    return Response.json({
      data: { issue: body.variables.id === issueB.id ? issueB : issue },
    });
  });
}
async function createEntry(ids = [issue.id, issueB.id]) {
  const verifiedLinearIssues = await verifyLinearIssueLinks(
    db,
    teamId,
    userId,
    ids,
  );
  const [entry] = await upsertTrackerEntries(db, {
    teamId,
    projectId,
    assignedId: userId,
    dates: ["2026-11-01"],
    start: "2026-11-01T14:00:00Z",
    stop: "2026-11-01T15:00:00Z",
    duration: 3600,
    description: "Client-safe work",
    linearIssueIds: ids,
    verifiedLinearIssues,
  });
  return entry!;
}
beforeAll(async () => {
  process.env.LINEAR_CLIENT_ID = "fixture-client";
  process.env.LINEAR_CLIENT_SECRET = "fixture-secret";
  process.env.LINEAR_REDIRECT_URI =
    "https://payments.example/tracker/linear/callback";
  process.env.MIDDAY_ENCRYPTION_KEY = "ab".repeat(32);
  await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  for (const table of [
    schema.teams,
    schema.users,
    schema.customers,
    schema.trackerProjects,
    schema.trackerEntries,
    schema.invoices,
    schema.activities,
  ])
    await pg.exec(fixtureTable(table));
  await pg.exec(
    await readFile(
      join(__dirname, "../../migrations/0046_tracker_linear_issues.sql"),
      "utf8",
    ),
  );
  await database.insert(schema.teams).values({ id: teamId });
  await database
    .insert(schema.users)
    .values([{ id: userId }, { id: otherUser }]);
  await database.insert(schema.trackerProjects).values({
    id: projectId,
    teamId,
    name: "Fixture",
    rate: 100,
    currency: "USD",
    billable: true,
    linearProject: { id: projectId, organizationId: orgId },
  });
}, 30000);
beforeEach(async () => {
  await pg.exec(
    "TRUNCATE linear_connections, tracker_entry_linear_issues, linear_issues, tracker_entries, invoices, activities CASCADE",
  );
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});
afterAll(async () => {
  envKeys.forEach((key, i) => {
    if (originalEnv[i] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[i];
  });
  await pg.close();
});

describe("Personal Linear authorization and minimal retention", () => {
  test("binds read-only PKCE to the user/team, encrypts all connection details, and handles callback retries once", async () => {
    const url = new URL(beginLinearConnection(teamId, userId).url);
    const state = url.searchParams.get("state")!;
    const decoded = decryptOAuthState<{ verifier: string }>(state)!;
    expect(url.searchParams.get("scope")).toBe("read");
    expect(url.searchParams.get("actor")).toBe("user");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    let exchanges = 0;
    mockFetch((target, options) => {
      if (target.endsWith("/oauth/token")) {
        exchanges++;
        expect(
          new URLSearchParams(String(options.body)).get("code_verifier"),
        ).toBe(decoded.verifier);
        return tokens();
      }
      return Response.json({
        data: {
          organization: {
            id: orgId,
            name: "Private org name",
            urlKey: "fixture",
          },
        },
      });
    });
    await expect(
      completeLinearConnection(db, teamId, otherUser, "code", state),
    ).rejects.toThrow("Invalid or expired");
    await expect(
      completeLinearConnection(db, "other-team", userId, "code", state),
    ).rejects.toThrow("Invalid or expired");
    await expect(
      completeLinearConnection(db, teamId, userId, "code", "tampered"),
    ).rejects.toThrow("Invalid or expired");
    expect(exchanges).toBe(0);
    await completeLinearConnection(db, teamId, userId, "code", state);
    await completeLinearConnection(db, teamId, userId, "code", state);
    expect(exchanges).toBe(1);
    expect(JSON.stringify(await stored())).not.toMatch(
      /new-access|new-refresh|Private org name|fixture-state/,
    );
    expect(await linearConnectionStatus(db, teamId, userId)).toMatchObject({
      connected: true,
      revocationPending: false,
    });
    expect(await linearConnectionStatus(db, teamId, otherUser)).toMatchObject({
      connected: false,
    });
  });

  test("never borrows another team member's authorization or accepts a swapped credential record", async () => {
    await seed();
    let calls = 0;
    mockFetch(() => {
      calls++;
      return Response.json({ data: emptyProjects });
    });
    await expect(searchLinearProjects(db, teamId, otherUser)).rejects.toThrow(
      "your own",
    );
    expect(calls).toBe(0);
    await database.insert(schema.linearConnections).values({
      teamId,
      userId: otherUser,
      encryptedConfig: (await stored())!.encryptedConfig,
    });
    await expect(searchLinearProjects(db, teamId, otherUser)).rejects.toThrow(
      "owner",
    );
    expect(calls).toBe(0);
  });

  test("rejects and revokes unexpectedly broad OAuth grants", async () => {
    const state = new URL(
      beginLinearConnection(teamId, userId).url,
    ).searchParams.get("state")!;
    let revocations = 0;
    mockFetch((url) => {
      if (url.endsWith("/oauth/revoke")) {
        revocations++;
        return new Response(null, { status: 200 });
      }
      return tokens("broad-access", "broad-refresh", "read write");
    });
    await expect(
      completeLinearConnection(db, teamId, userId, "code", state),
    ).rejects.toThrow("more than read-only");
    expect(revocations).toBe(2);
    expect(await stored()).toBeUndefined();
  });

  test("recovers a lost refresh response, atomically rotates tokens, and serializes concurrent refreshes", async () => {
    await seed(userId, 0);
    let attempts = 0;
    mockFetch((target, options) => {
      if (target.endsWith("/oauth/token")) {
        attempts++;
        expect(
          new URLSearchParams(String(options.body)).get("refresh_token"),
        ).toBe(`refresh-${userId}`);
        if (attempts === 1) throw new Error("lost response");
        return tokens();
      }
      expect(new Headers(options.headers).get("Authorization")).toBe(
        "Bearer new-access",
      );
      return Response.json({ data: emptyProjects });
    });
    await expect(searchLinearProjects(db, teamId, userId)).rejects.toThrow(
      "lost response",
    );
    expect(
      JSON.parse(decrypt((await stored())!.encryptedConfig)).credentials
        .refreshToken,
    ).toBe(`refresh-${userId}`);
    const retryState = new URL(
      beginLinearConnection(teamId, userId).url,
    ).searchParams.get("state")!;
    await expect(
      completeLinearConnection(db, teamId, userId, "new-code", retryState),
    ).rejects.toThrow("Disconnect your existing");
    expect(attempts).toBe(1);
    await Promise.all([
      searchLinearProjects(db, teamId, userId),
      searchLinearProjects(db, teamId, userId),
    ]);
    expect(attempts).toBe(2);
    expect(
      JSON.parse(decrypt((await stored())!.encryptedConfig)).credentials,
    ).toMatchObject({ accessToken: "new-access", refreshToken: "new-refresh" });
  });

  test("refreshes rejected access tokens even before expiry", async () => {
    await seed();
    let attempts = 0;
    mockFetch((target, options) => {
      if (target.endsWith("/oauth/token")) {
        attempts++;
        return tokens();
      }
      return new Headers(options.headers).get("Authorization") ===
        "Bearer new-access"
        ? Response.json({ data: emptyProjects })
        : Response.json({
            errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
          });
    });
    await searchLinearProjects(db, teamId, userId);
    expect(attempts).toBe(1);
  });

  test("searches and project linking persist no titles, URLs, identifiers or search results", async () => {
    await seed();
    mockFetch((_target, options) => {
      const body = JSON.parse(String(options.body));
      if (body.query.includes(" project(id:"))
        return Response.json({
          data: {
            project: {
              id: projectId,
              name: "Private project name",
              url: "https://linear.app/fixture/project/private-name",
            },
          },
        });
      if (body.variables.id) return Response.json({ data: { issue } });
      return Response.json({
        data: {
          issues: {
            nodes: [issue, issueB],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    });
    const exact = await searchLinearIssues(
      db,
      teamId,
      userId,
      projectId,
      "FUR-10 https://linear.app/fixture/issue/FUR-10/title",
    );
    expect(exact).toMatchObject({ exact: true, requiresChoice: false });
    expect(exact.nodes).toHaveLength(1);
    expect(
      (
        await searchLinearIssues(
          db,
          teamId,
          userId,
          projectId,
          "Private issue title",
        )
      ).requiresChoice,
    ).toBe(true);
    await linkLinearProject(db, teamId, userId, projectId, projectId);
    expect(await database.select().from(schema.linearIssues)).toEqual([]);
    const [project] = await database.select().from(schema.trackerProjects);
    expect(project!.linearProject).toEqual({
      id: projectId,
      organizationId: orgId,
    });
    mockFetch(() =>
      Response.json({ data: { issue: { ...issue, project: null } } }),
    );
    expect(
      (await searchLinearIssues(db, teamId, userId, projectId, "FUR-10"))
        .requiresChoice,
    ).toBe(true);
  });

  test("live access checks prevent shared-cache leaks and guessing a previously linked issue ID", async () => {
    await seed();
    await seed(otherUser);
    liveIssues();
    const entry = await createEntry([issue.id]);
    expect(
      (await getEntryLinearIssues(db, teamId, userId, entry.id))[0]!.title,
    ).toBe(issue.title);
    mockFetch((_target, options) =>
      new Headers(options.headers).get("Authorization") ===
      `Bearer access-${otherUser}`
        ? Response.json({ errors: [{ extensions: { code: "FORBIDDEN" } }] })
        : Response.json({ data: { issue } }),
    );
    const hidden = await getEntryLinearIssues(db, teamId, otherUser, entry.id);
    expect(hidden[0]).toMatchObject({
      id: issue.id,
      title: null,
      url: null,
      unavailable: true,
    });
    expect(JSON.stringify(hidden)).not.toContain(issue.title);
    await expect(
      verifyLinearIssueLinks(db, teamId, otherUser, [issue.id]),
    ).rejects.toThrow("Check access");
    // Keeping or removing an already shared opaque link never grants ticket access.
    expect(
      (
        await updateEntryLinearIssues(db, teamId, otherUser, entry.id, [
          issue.id,
        ])
      )[0]!.title,
    ).toBeNull();
    expect(
      await updateEntryLinearIssues(db, teamId, otherUser, entry.id, []),
    ).toEqual([]);
  });

  test("moved issues refresh by UUID after invoicing without persisting private data or changing financial records", async () => {
    await seed();
    liveIssues();
    const first = await createEntry();
    const second = await createEntry([issue.id]);
    await draftInvoiceFromTracker(db, {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      teamId,
      userId,
      token: "fixture",
      template: { currency: "USD" },
      invoiceNumber: "FIXTURE-1",
      issueDate: "2026-11-02",
      dueDate: "2026-12-02",
      amount: 200,
      lineItems: [
        { name: "Client-safe work", quantity: 2, price: 100, unit: "hours" },
      ],
      trackerEntryIds: [first.id, second.id],
      uninvoicedOnly: true,
    });
    const before = await database.select().from(schema.trackerEntries);
    const invoices = await database.select().from(schema.invoices);
    mockFetch((_target, options) => {
      const id = JSON.parse(String(options.body)).variables.id;
      return Response.json({
        data: {
          issue:
            id === issueB.id
              ? issueB
              : {
                  ...issue,
                  identifier: "ENG-99",
                  title: "Renamed private title",
                  team: { id: otherUser },
                  project: null,
                },
        },
      });
    });
    const moved = await getEntryLinearIssues(db, teamId, userId, first.id);
    expect(moved.find((ref) => ref.id === issue.id)).toMatchObject({
      identifier: "ENG-99",
      linearTeamId: otherUser,
    });
    await refreshLinearIssues(db, teamId, userId, [issue.id, issue.id]);
    await refreshLinearIssues(db, teamId, userId, [issue.id]);
    expect(
      (await getTrackerEntryById(db, { teamId, id: first.id }))!.linearIssues,
    ).toHaveLength(2);
    expect(
      JSON.stringify(await database.select().from(schema.linearIssues)),
    ).not.toMatch(/FUR-|ENG-|title|url|Private|Renamed/);
    expect(await database.select().from(schema.trackerEntries)).toEqual(before);
    expect(await database.select().from(schema.invoices)).toEqual(invoices);
    mockFetch(() =>
      Response.json({ errors: [{ extensions: { code: "FORBIDDEN" } }] }),
    );
    expect(
      (await getEntryLinearIssues(db, teamId, userId, first.id))[0]!.title,
    ).toBeNull();
  });

  test("disconnect revokes the current pair only and cannot affect another user's connection", async () => {
    await seed();
    await seed(otherUser);
    const revoked: string[] = [];
    mockFetch((url, options) => {
      expect(url).toBe("https://api.linear.app/oauth/revoke");
      revoked.push(new URLSearchParams(String(options.body)).get("token")!);
      return new Response(null, { status: 200 });
    });
    expect(await disconnectLinear(db, teamId, userId)).toEqual({
      connected: false,
      revocationPending: false,
    });
    expect(revoked).toEqual([`refresh-${userId}`, `access-${userId}`]);
    expect(await stored()).toBeUndefined();
    expect(
      (await linearConnectionStatus(db, teamId, otherUser)).connected,
    ).toBe(true);
    await disconnectLinear(db, teamId, userId);
    expect(revoked).toHaveLength(2);
  });

  test("failed revocation disables local access and keeps encrypted credentials for retry", async () => {
    await seed();
    mockFetch(() => new Response("Unavailable", { status: 503 }));
    await expect(disconnectLinear(db, teamId, userId)).rejects.toThrow(
      "Retry disconnecting",
    );
    expect(await linearConnectionStatus(db, teamId, userId)).toMatchObject({
      connected: false,
      revocationPending: true,
    });
    await expect(searchLinearProjects(db, teamId, userId)).rejects.toThrow(
      "your own",
    );
    const state = new URL(
      beginLinearConnection(teamId, userId).url,
    ).searchParams.get("state")!;
    await expect(
      completeLinearConnection(db, teamId, userId, "code", state),
    ).rejects.toThrow("Finish disconnecting");
    mockFetch(() => new Response(null, { status: 400 })); // Already revoked after an earlier response was lost.
    await disconnectLinear(db, teamId, userId);
    expect(await stored()).toBeUndefined();
  });

  test("disconnect recovers the current pair after a lost early refresh response", async () => {
    await seed();
    let exchanges = 0;
    const revoked: string[] = [];
    mockFetch((url, options) => {
      if (url.endsWith("/oauth/revoke")) {
        revoked.push(new URLSearchParams(String(options.body)).get("token")!);
        return new Response(null, { status: 200 });
      }
      if (url.endsWith("/oauth/token")) {
        exchanges++;
        if (exchanges === 1) throw new Error("lost early refresh response");
        return tokens("recovered-access", "recovered-refresh");
      }
      return Response.json({
        errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
      });
    });
    await expect(searchLinearProjects(db, teamId, userId)).rejects.toThrow(
      "lost early refresh",
    );
    await disconnectLinear(db, teamId, userId);
    expect(revoked).toEqual(["recovered-refresh", "recovered-access"]);
    expect(await stored()).toBeUndefined();
  });

  test("keeps a lost token rotation disabled when recovery can no longer be confirmed", async () => {
    await seed(userId, 0);
    let attempts = 0;
    let revocations = 0;
    mockFetch((target) => {
      if (target.endsWith("/oauth/revoke")) {
        revocations++;
        return new Response(null, { status: 400 });
      }
      if (++attempts === 1) throw new Error("lost rotated pair");
      return new Response(null, { status: 401 });
    });
    await expect(searchLinearProjects(db, teamId, userId)).rejects.toThrow(
      "lost rotated pair",
    );
    await expect(searchLinearProjects(db, teamId, userId)).rejects.toThrow(
      "authorization failed",
    );
    expect(
      JSON.parse(decrypt((await stored())!.encryptedConfig)).refreshUncertain,
    ).toBe(true);
    await expect(disconnectLinear(db, teamId, userId)).rejects.toThrow(
      "Revocation could not be confirmed",
    );
    expect((await stored())?.revocationPending).toBe(true);
    expect(revocations).toBe(0);
  });

  test("database roles cannot read tokens or ticket refs directly", async () => {
    const rows = await pg.query<{ allowed: boolean }>(
      "SELECT has_table_privilege('authenticated', 'linear_connections', 'SELECT') OR has_table_privilege('anon', 'linear_issues', 'SELECT') AS allowed",
    );
    expect(rows.rows[0]!.allowed).toBe(false);
  });
});
