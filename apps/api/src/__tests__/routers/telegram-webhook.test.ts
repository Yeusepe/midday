import { beforeEach, expect, mock, test } from "bun:test";

const bot = {
  initialize: mock(async () => {}),
  webhooks: {} as Record<string, (request: Request) => Response>,
};
mock.module("@midday/bot", () => ({ bot }));
mock.module("@api/bot/runtime", () => ({ registerMiddayBotRuntime() {} }));
const { telegramWebhookRouter } = await import("../../rest/routers/webhooks/telegram");

beforeEach(() => {
  delete bot.webhooks.telegram;
  bot.initialize.mockClear();
});

test("an unconfigured Telegram adapter returns 503", async () => {
  const response = await telegramWebhookRouter.request("/", { method: "POST" });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Telegram is not configured" });
});

test("a configured Telegram adapter receives the request", async () => {
  bot.webhooks.telegram = mock((request) => new Response(request.method));
  const response = await telegramWebhookRouter.request("/", { method: "POST" });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("POST");
  expect(bot.initialize).toHaveBeenCalledTimes(1);
});
