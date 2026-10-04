import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import {
  getAIModelName,
  getAIProvider,
  getAISessionId,
  getEmbeddingModel,
  getLanguageModel,
  getWebSearchTools,
} from "./index";

const envKeys = [
  "MIDDAY_AI_PROVIDER",
  "MIDDAY_AI_MODEL",
  "MIDDAY_AI_SMALL_MODEL",
  "MIDDAY_AI_NANO_MODEL",
  "MIDDAY_AI_EMBEDDING_PROVIDER",
  "MIDDAY_AI_EMBEDDING_MODEL",
  "OPENCODE_API_KEY",
] as const;
const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
);
const requests: { url: string; headers: Headers; body: any }[] = [];
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const prompt = [
  {
    role: "user" as const,
    content: [{ type: "text" as const, text: "Hello" }],
  },
];

beforeEach(() => {
  for (const key of envKeys) delete process.env[key];
  process.env.MIDDAY_AI_PROVIDER = "opencode-go";
  process.env.OPENCODE_API_KEY = "test-key";
  requests.length = 0;
  const mockFetch = Object.assign(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      requests.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({
        id: "reply-1",
        created: 1,
        model: "deepseek-v4-flash",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hello" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    },
    { preconnect: fetch.preconnect },
  );
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(mockFetch);
});

afterEach(() => {
  fetchSpy.mockRestore();
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

test("Go sends authenticated chat-completion requests with shared conversation identity", async () => {
  const session = getAISessionId("dashboard", "team", "user", "chat");
  const main = getLanguageModel("default", undefined, session);
  const title = getLanguageModel("small", undefined, session);
  await main.doGenerate({ prompt, headers: { "user-agent": "ai/6.0.141" } });
  await title.doGenerate({ prompt });
  await main.doGenerate({ prompt });

  expect(getAIProvider()).toBe("opencode-go");
  for (const request of requests) {
    expect(request.url).toBe("https://opencode.ai/zen/go/v1/chat/completions");
    expect(request.body.model).toBe("deepseek-v4-flash");
    expect(request.headers.get("authorization")).toBe("Bearer test-key");
    expect(request.headers.get("user-agent")).toContain("creator-payments/1.0");
    expect(request.headers.get("x-opencode-session")).toBe(session);
  }
});

test("session IDs isolate conversations and users and do not contain raw identity", () => {
  const session = getAISessionId("dashboard", "team", "user", "chat");
  expect(session).toMatch(/^[a-f0-9]{64}$/);
  expect(getAISessionId("dashboard", "team", "user", "chat")).toBe(session);
  expect(getAISessionId("dashboard", "team", "user", "other")).not.toBe(
    session,
  );
  expect(getAISessionId("dashboard", "team", "other", "chat")).not.toBe(
    session,
  );
  expect(getAISessionId("slack", "team", "user", "chat")).not.toBe(session);
});

test("standalone operations have separate IDs that stay stable across retries", async () => {
  const first = getLanguageModel();
  await first.doGenerate({ prompt });
  await first.doGenerate({ prompt });
  await getLanguageModel().doGenerate({ prompt });
  const ids = requests.map(({ headers }) => headers.get("x-opencode-session"));
  expect(ids[0]).toBeTruthy();
  expect(ids[1]).toBe(ids[0]);
  expect(ids[2]).not.toBe(ids[0]);
});

test("Go respects model overrides and keeps embeddings and built-in search separate", () => {
  process.env.MIDDAY_AI_SMALL_MODEL = "kimi-k2.6";
  expect(getAIModelName("small")).toBe("kimi-k2.6");
  expect(getAIModelName("nano")).toBe("deepseek-v4-flash");
  expect(getLanguageModel("default", "glm-5.3-flash").modelId).toBe(
    "glm-5.3-flash",
  );
  expect(getEmbeddingModel().modelId).toBe("text-embedding-3-small");
  process.env.MIDDAY_AI_EMBEDDING_PROVIDER = "google";
  expect(getEmbeddingModel().modelId).toBe("gemini-embedding-001");
  expect(getWebSearchTools({})).toEqual({});
});

test("Go fails clearly without a key and existing providers remain selectable", () => {
  delete process.env.OPENCODE_API_KEY;
  expect(() => getLanguageModel()).toThrow("OPENCODE_API_KEY is required");
  for (const provider of ["openai", "google", "anthropic"] as const) {
    process.env.MIDDAY_AI_PROVIDER = provider;
    expect(getAIProvider()).toBe(provider);
    expect(getLanguageModel().provider).not.toContain("opencode");
  }
});
