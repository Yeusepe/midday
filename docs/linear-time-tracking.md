# Linear tickets in the time tracker

Tracker projects link to Linear projects. Entries and timers can reference multiple issues, and each issue can span entries. Ticket links remain separate from invoice descriptions, hours, billing status and financial totals.

## Security and retention

Each Payments user connects their own Linear account in each Payments team. Searches, new attachments and live details use the authenticated caller's token, including REST and MCP. Assigning an entry to another person never borrows that person's authorization. There is no shared fallback token.

The database retains only stable issue/project UUIDs, organization UUIDs and entry associations. It does not persist issue identifiers, titles, URLs, descriptions, comments, project names or search results. Ordinary tracker reads return minimal references. Live detail endpoints fetch from Linear using the viewer's authorization. Inaccessible issues return null details and `unavailable: true`, without another user's cached data. Existing opaque links can still be retained or removed.

Connection data, including tokens and workspace display information, is AES-256-GCM encrypted in a dedicated `linear_connections` table. The encrypted payload includes and checks its Payments team/user identity. Generic app settings APIs do not expose or delete these connections. RLS and revoked database privileges block direct anonymous/authenticated-role access; API queries enforce team and user boundaries.

OAuth requests only `read`, uses PKCE S256 and user/team-bound state, and rejects broader grants. Token rotation is serialized with row locks. Lost refresh responses record uncertainty so reads or disconnect can recover the current token pair before using it.

Disconnect disables local access first, then revokes both credentials at Linear. Network/server failures retain encrypted credentials in a disabled, revocation-pending state and offer a retry. Linear's documented invalid/already-revoked 400/401 responses are handled idempotently. Reconnection is blocked while revocation is pending; replacing an active connection revokes its previous credentials first. If a lost rotated pair can no longer be recovered, the connection stays disabled and cannot claim successful revocation; revoke the application in Linear's Authorized applications.

Private detail responses use `Cache-Control: private, no-store`. Browser Linear requests use separate POST batches to keep search text out of request URLs. Linear tRPC inputs/errors are excluded from diagnostic payloads and tRPC loggers. Error-reporting events, traces and breadcrumbs containing Linear request or callback context are dropped, including automatically captured request data. Live detail query caches are discarded when unused and cleared on disconnect. REST/MCP consumers remain responsible for their own logs and conversation retention.

## Limits and incident response

A database-only leak still exposes opaque identifiers and time-entry relationships, plus existing Payments data. It does not expose plaintext Linear tokens or a stored copy of ticket titles. A server compromise that also exposes the encryption key can expose OAuth grants. Linear's read permission covers the authorizing account's access, not just the project selected in Payments. Restrict access in Linear accordingly.

If credentials leak, revoke the application in Linear's **Security & Access > Authorized applications**, then rotate affected infrastructure secrets with a migration/re-encryption plan. Client-secret rotation alone does not revoke authorization-code token pairs. Do not replace the shared encryption key without migrating other encrypted data. Revocation cannot erase copied data, and the application cannot prevent users manually copying private text into invoice descriptions or external conversations.

This uses Linear's official GraphQL API and OAuth. Its official MCP also supports OAuth/PKCE and a read-only endpoint. Switching transport alone would not protect credentials stored by Payments. Dynamic MCP client registration is not implemented, and Payments does not borrow credentials from a user's separate Linear connector.

## Setup and rollout

1. Apply `packages/db/migrations/0046_tracker_linear_issues.sql` before deploying the API/dashboard, inside a transaction using the normal migration procedure. This unshipped migration was revised for personal connections and minimal references and has not been applied to production. A database that received an earlier draft needs an explicit upgrade instead.
2. Create a Linear OAuth application in **Settings > Administration > API**. Register the exact callback `https://payments.yucp.club/tracker/linear/callback` (or your development dashboard equivalent).
3. Set `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`, and `LINEAR_REDIRECT_URI` in the **Payments API application's environment variables in Coolify**. Payments has migrated off Zeabur. Retain the existing persistent `MIDDAY_ENCRYPTION_KEY`, a 32-byte key encoded as 64 hex characters. Keep secrets server-side.
4. Deploy the API and dashboard. Each user opens a tracker project's edit form, chooses **Connect your Linear account**, completes read-only consent, then explicitly selects the matching Linear project. Project mappings are shared; names and titles require the viewer's own access.
5. Refresh/reconnect Creator Payments clients that cache MCP tool lists. Existing tracker scopes cover the new tools. Each connector user needs their own completed Linear connection in Payments.

No production entries, invoices or Linear objects were edited for testing. Real OAuth consent and browser validation require the deployment/configuration above.

## Workflow and API

Paste IDs/URLs separated by commas or whitespace. Exact in-project references attach automatically. Empty searches suggest tickets; title matches and outside-project references require selection. Pasted URLs are parsed, never fetched. At most 50 tickets can be linked per entry.

Existing entry ticket changes save immediately through a links-only mutation. New references are verified against the caller's live Linear access before writes, including entry create/update/bulk and timer start. Guessing an ID previously linked by someone else does not authorize an attachment. Clients cannot supply trusted verification results or private metadata.

Project reads include `linearProject: {id, organizationId}`; entry/timer reads include `linearIssues: [{id, organizationId}]`. Write inputs accept optional `linearIssueIds`: omit to preserve, use `[]` to clear. Fetch live details to display names/titles. Refresh is on demand; there are no webhooks or scheduled synchronization. Stable IDs preserve associations through renames and moves. Failed reads do not change links or financial records.

| REST endpoint | Purpose | Scope |
| --- | --- | --- |
| `GET /tracker-linear/projects?query=...&after=...` | Find accessible projects | `tracker-projects.read` |
| `GET /tracker-linear/project?projectId=...` | Linked project's live details; null if inaccessible | `tracker-projects.read` |
| `PUT /tracker-linear/project` | `{projectId, linearProjectId}`; null unlinks | `tracker-projects.write` |
| `GET /tracker-linear/issues?projectId=...&query=...&after=...` | Resolve/search; returns `nodes`, `pageInfo`, `exact`, `requiresChoice` | `tracker-entries.read` |
| `GET /tracker-linear/entries/{entryId}` | Live details with caller's access | `tracker-entries.read` |
| `PUT /tracker-linear/entries/{entryId}` | `{issueIds: [...]}`; replace links only | `tracker-entries.write` |
| `POST /tracker-linear/refresh` | `{issueIds: [...]}`; live details by UUID | `tracker-entries.write` |

MCP tools: `tracker_linear_connection`, `tracker_linear_projects`, `tracker_linear_project_get`, `tracker_linear_project_link`, `tracker_linear_issues_resolve`, `tracker_entry_linear_issues_get`, `tracker_entry_linear_issues_set`, and `tracker_linear_issues_refresh`. Results include `structuredContent.data`. Existing entry create/update and timer start tools accept `linearIssueIds` too.

Connector workflow: resolve in project context, request a selection if `requiresChoice` is true, then attach selected UUIDs. Read existing refs before adding/removing so other links are retained. Ticket context must remain separate from invoice text.

## Validation

Tests use synthetic fixtures, isolated PGlite PostgreSQL, the actual migration and production queries/services. No external credentials or production data are used.

```powershell
# From packages/db
bun test --exit --timeout 30000 src/test/tracker-linear.test.ts src/test/linear-service.test.ts src/test/tracker-entries.test.ts src/test/tracker-invoices.test.ts

# From apps/api
bun test --exit src/__tests__/services/linear-client.test.ts src/__tests__/services/linear-telemetry.test.ts
bun test --exit --timeout 30000 --preload ./src/__tests__/setup.ts src/__tests__/trpc/invoices.test.ts src/__tests__/trpc/tracker-entries.test.ts
bun test --exit --timeout 30000 src/__tests__/mcp/mcp-router.test.ts
bun test --exit --timeout 30000 src/__tests__/mcp/tracker-linear.test.ts
```

Coverage includes user/team isolation, ciphertext ownership, private issue access, guessed IDs, forged verification input, broader grants, OAuth/refresh retries, provider revocation, minimal retention, multiple/shared issues, moved issues after invoicing, invoice privacy and unchanged financial records.

Official references: [GraphQL](https://linear.app/developers/graphql), [OAuth and revocation](https://linear.app/developers/oauth-2-0-authentication), [MCP](https://linear.app/docs/mcp), [Security & Access](https://linear.app/docs/security-and-access), [filtering](https://linear.app/developers/filtering), [pagination](https://linear.app/developers/pagination), [webhooks](https://linear.app/developers/webhooks).
