import { z } from "zod";

const linearUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "linear.app";
  });
export const linearProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  url: linearUrl,
});
const issueSchema = z.object({
  id: z.string().uuid(),
  identifier: z.string(),
  title: z.string(),
  url: linearUrl,
  team: z.object({ id: z.string().uuid() }),
  project: z.object({ id: z.string().uuid() }).nullable(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
});
const pageInfo = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});
const issueFields =
  "id identifier title url updatedAt archivedAt team { id } project { id }";

export class LinearRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// Never follow a pasted URL. Extract only issue references for the fixed GraphQL endpoint.
export function parseLinearReferences(
  query: string,
  workspace: string,
): string[] | null {
  const tokens = query
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!tokens.length) return null;
  const ids: string[] = [];
  for (const token of tokens) {
    if (/^https?:\/\//i.test(token)) {
      const url = new URL(token);
      const parts = url.pathname.split("/");
      if (
        url.protocol !== "https:" ||
        url.hostname !== "linear.app" ||
        parts[1] !== workspace ||
        parts[2] !== "issue" ||
        !parts[3]
      ) {
        throw new Error(
          "Paste an issue URL from the connected Linear workspace",
        );
      }
      ids.push(parts[3]);
    } else if (
      /^[a-z][a-z0-9_]*-\d+$/i.test(token) ||
      z.string().uuid().safeParse(token).success
    ) {
      ids.push(token);
    } else return null;
  }
  if (ids.length > 50) throw new Error("Link at most 50 issues at a time");
  return [...new Set(ids)];
}

export class LinearClient {
  constructor(
    private accessToken: string,
    private request: (
      url: string,
      options: RequestInit,
    ) => Promise<Response> = fetch,
  ) {}

  async query<T>(
    query: string,
    variables: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.request("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        if (attempt < 2) continue;
        throw new LinearRequestError(
          "Linear is unavailable. Try again; existing links are unchanged.",
          503,
        );
      }
      const body = (await response.json().catch(() => ({}))) as {
        data?: unknown;
        errors?: { extensions?: { code?: string } }[];
      };
      const codes = body.errors?.map((error) => error.extensions?.code) ?? [];
      const unauthorized =
        response.status === 401 ||
        codes.includes("AUTHENTICATION_ERROR") ||
        codes.includes("UNAUTHENTICATED");
      const rateLimited =
        response.status === 429 || codes.includes("RATELIMITED");
      if ((response.status >= 500 || rateLimited) && attempt < 2) {
        const delay = Number(response.headers.get("retry-after") ?? 1);
        if (Number.isFinite(delay) && delay <= 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.max(0, delay) * 1000),
          );
          continue;
        }
      }
      if (!response.ok || body.errors?.length)
        throw new LinearRequestError(
          unauthorized
            ? "Reconnect Linear to restore access"
            : rateLimited
              ? "Linear rate limit reached. Retry shortly; existing links are unchanged."
              : "Linear could not complete the request. Check access and retry.",
          unauthorized
            ? 401
            : rateLimited
              ? 429
              : response.status >= 400
                ? response.status
                : 502,
        );
      return schema.parse(body.data);
    }
  }

  organization() {
    return this.query(
      "query { organization { id name urlKey } }",
      {},
      z.object({
        organization: z.object({
          id: z.string().uuid(),
          name: z.string(),
          urlKey: z.string(),
        }),
      }),
    );
  }
  projects(query = "", after?: string) {
    return this.query(
      "query($filter: ProjectFilter, $after: String) { projects(first: 50, after: $after, filter: $filter) { nodes { id name url } pageInfo { hasNextPage endCursor } } }",
      { filter: query ? { name: { containsIgnoreCase: query } } : {}, after },
      z.object({
        projects: z.object({ nodes: z.array(linearProjectSchema), pageInfo }),
      }),
    );
  }
  project(id: string) {
    return this.query(
      "query($id: String!) { project(id: $id) { id name url } }",
      { id },
      z.object({ project: linearProjectSchema }),
    );
  }
  issue(id: string) {
    return this.query(
      `query($id: String!) { issue(id: $id) { ${issueFields} } }`,
      { id },
      z.object({ issue: issueSchema }),
    );
  }
  issues(projectId: string, query = "", after?: string) {
    return this.query(
      `query($filter: IssueFilter, $after: String) { issues(first: 50, after: $after, filter: $filter, orderBy: updatedAt) { nodes { ${issueFields} } pageInfo { hasNextPage endCursor } } }`,
      {
        filter: {
          project: { id: { eq: projectId } },
          ...(query ? { title: { containsIgnoreCase: query } } : {}),
        },
        after,
      },
      z.object({ issues: z.object({ nodes: z.array(issueSchema), pageInfo }) }),
    );
  }
}

export function issueRef(
  issue: z.infer<typeof issueSchema>,
  organizationId: string,
) {
  const { team, project, ...fields } = issue;
  return {
    ...fields,
    organizationId,
    linearTeamId: team.id,
    projectId: project?.id ?? null,
  };
}
