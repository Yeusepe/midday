import { afterEach, expect, mock, test } from "bun:test";
mock.module("@midday/banking", () => ({ Provider: {} }));
mock.module("@midday/cache/health", () => ({ checkHealth: async () => {} }));
mock.module("@midday/db/utils/health", () => ({ checkHealth: async () => {} }));
const { supabaseProbe } = await import("./probes");

const originalFetch = globalThis.fetch;
const keys = ["SUPABASE_HEALTH_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;
const originalEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of keys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

for (const [healthUrl, serverUrl, publicUrl, expectedUrl] of [
  ["http://kong:8000", "https://payments.example/supabase", "https://public.example", "http://kong:8000/auth/v1/health"],
  ["", "https://payments.example/supabase", "https://public.example", "https://payments.example/supabase/auth/v1/health"],
  ["", "", "https://public.example", "https://public.example/auth/v1/health"],
]) {
  test(`Supabase readiness checks ${expectedUrl}`, async () => {
    process.env.SUPABASE_HEALTH_URL = healthUrl;
    process.env.SUPABASE_URL = serverUrl;
    process.env.NEXT_PUBLIC_SUPABASE_URL = publicUrl;
    process.env.SUPABASE_SECRET_KEY = "test-key";
    let requested = false;
    globalThis.fetch = (async (url, options) => {
      requested = true;
      expect(url).toBe(expectedUrl);
      expect(options?.headers).toEqual({ apikey: "test-key" });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    expect(await supabaseProbe().probe()).toBe(true);
    expect(requested).toBe(true);
  });
}
