import { expect, mock, spyOn, test } from "bun:test";
import type { McpContext } from "@api/mcp/types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

mock.module("@api/mcp/server", () => ({
  createMcpServer: () => {
    const server = new McpServer({ name: "tool-search-test", version: "1.0" });
    server.registerTool(
      "invoices_list",
      { description: "List unpaid customer invoices", inputSchema: {} },
      async () => ({ content: [{ type: "text", text: "[]" }] }),
    );
    server.registerTool(
      "tracker_timer_start",
      { description: "Start tracking project time", inputSchema: {} },
      async () => ({ content: [{ type: "text", text: "ok" }] }),
    );
    return server;
  },
}));

test("keyword tool search warms up and selects tools without an embedding request", async () => {
  const previous = process.env.MIDDAY_TOOL_SEARCH;
  process.env.MIDDAY_TOOL_SEARCH = "keyword";
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async () => {
        throw new Error("Tool search must not call an embedding API");
      },
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    const { ensureToolIndex } = await import("@api/chat/tools");
    const index = await ensureToolIndex({} as McpContext);
    const selected = await index.select("unpaid customer invoices", {
      maxTools: 1,
    });
    expect(selected).toEqual(["invoices_list"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
    if (previous === undefined) delete process.env.MIDDAY_TOOL_SEARCH;
    else process.env.MIDDAY_TOOL_SEARCH = previous;
  }
});
