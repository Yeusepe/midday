import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  LinearClient,
  LinearRequestError,
  parseLinearReferences,
} from "../../services/linear-client";

describe("Linear reference resolution", () => {
  test("parses multiple IDs, UUIDs and URLs without following arbitrary URLs", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(
      parseLinearReferences(
        `FUR-10, https://linear.app/fixture/issue/FUR-20/title ${id} FUR-10`,
        "fixture",
      ),
    ).toEqual(["FUR-10", "FUR-20", id]);
    expect(parseLinearReferences("Shared title", "fixture")).toBeNull();
    expect(parseLinearReferences("", "fixture")).toBeNull();
    for (const url of [
      "https://evil.test/fixture/issue/FUR-1",
      "http://linear.app/fixture/issue/FUR-1",
      "https://linear.app/other/issue/FUR-1",
    ])
      expect(() => parseLinearReferences(url, "fixture")).toThrow(
        "connected Linear workspace",
      );
  });

  test("retries non-JSON failures and rate limits using the fixed API endpoint", async () => {
    const calls: string[] = [];
    const responses = [
      new Response("Bad gateway", {
        status: 502,
        headers: { "Retry-After": "0" },
      }),
      Response.json(
        { errors: [{ extensions: { code: "RATELIMITED" } }] },
        { headers: { "Retry-After": "0" } },
      ),
      Response.json({ data: { ok: true } }),
    ];
    const client = new LinearClient("fixture-token", async (url) => {
      calls.push(String(url));
      return responses.shift()!;
    });
    expect(
      await client.query("query { ok }", {}, z.object({ ok: z.boolean() })),
    ).toEqual({ ok: true });
    expect(calls).toEqual(Array(3).fill("https://api.linear.app/graphql"));
  });

  test("reports expired auth for refresh and bounds failed retries without provider secrets", async () => {
    let calls = 0;
    const client = new LinearClient("private-token", async () => {
      calls++;
      return Response.json({
        errors: [
          {
            message: "private-provider-details",
            extensions: { code: "UNAUTHENTICATED" },
          },
        ],
      });
    });
    try {
      await client.organization();
      throw new Error("Expected authorization failure");
    } catch (error) {
      expect(error).toBeInstanceOf(LinearRequestError);
      expect((error as LinearRequestError).status).toBe(401);
      expect(String(error)).not.toContain("private");
    }
    expect(calls).toBe(1);
    const failed = new LinearClient("private-token", async () => {
      calls++;
      throw new Error("network");
    });
    await expect(failed.organization()).rejects.toThrow("unavailable");
    expect(calls).toBe(4);
  });

  test("includes project context and cursor in live suggestions", async () => {
    const client = new LinearClient("fixture-token", async (_url, options) => {
      const request = JSON.parse(String(options?.body));
      expect(request.variables).toEqual({
        filter: {
          project: { id: { eq: "project-uuid" } },
          title: { containsIgnoreCase: "same title" },
        },
        after: "cursor",
      });
      return Response.json({
        data: {
          issues: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    });
    await client.issues("project-uuid", "same title", "cursor");
  });
});
