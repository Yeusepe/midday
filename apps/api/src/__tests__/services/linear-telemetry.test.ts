import { describe, expect, test } from "bun:test";
import { containsLinearTelemetry } from "@midday/utils/linear-telemetry";

describe("Linear telemetry privacy", () => {
  test("excludes callbacks, private batches, REST requests and provider spans", () => {
    for (const url of [
      "https://payments.example/tracker/linear/callback?code=private&state=secret",
      "https://api.example/trpc/trackerEntries.get,linear.searchIssues?batch=1",
      "https://api.example/tracker-linear/issues?query=private",
      "https://api.linear.app/graphql",
      "https://api.linear.app/oauth/token",
    ]) {
      expect(
        containsLinearTelemetry({ request: { url, data: "private body" } }),
      ).toBe(true);
      expect(
        containsLinearTelemetry({ spans: [{ data: { "http.url": url } }] }),
      ).toBe(true);
      expect(
        containsLinearTelemetry({ data: { to: url }, category: "navigation" }),
      ).toBe(true);
    }
    expect(containsLinearTelemetry({ tags: { path: "linear.complete" } })).toBe(
      true,
    );
  });

  test("preserves ordinary diagnostics without Linear context", () => {
    expect(
      containsLinearTelemetry({
        request: { url: "https://api.example/trpc/trackerEntries.get" },
        message: "Database unavailable",
        spans: [],
      }),
    ).toBe(false);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(containsLinearTelemetry(circular)).toBe(false);
    circular.tags = { path: "linear.complete" };
    expect(containsLinearTelemetry(circular)).toBe(true);
  });
});
