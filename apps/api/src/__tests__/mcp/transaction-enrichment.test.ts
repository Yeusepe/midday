import "../setup";
import { beforeEach, describe, expect, test } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTransactionTools } from "../../mcp/tools/transactions";
import type { McpContext } from "../../mcp/types";
import {
  createTransactionInput,
  createValidTransactionResponse,
} from "../factories/transaction";
import { mocks } from "../setup";

function handlers() {
  const server = new McpServer({ name: "test", version: "1" });
  registerTransactionTools(server, {
    db: {} as McpContext["db"],
    teamId: "team-a",
    userId: "user-a",
    userEmail: null,
    scopes: ["transactions.write"],
    apiUrl: "https://example.com",
    timezone: "UTC",
    locale: "en",
    countryCode: null,
    dateFormat: null,
    timeFormat: 24,
  });
  return (
    server as unknown as {
      _registeredTools: Record<
        string,
        {
          handler: (
            input: unknown,
            extra: unknown,
          ) => Promise<{ isError?: boolean }>;
        }
      >;
    }
  )._registeredTools;
}

describe("MCP transaction creation enrichment", () => {
  beforeEach(() => {
    mocks.triggerJob.mockReset();
    mocks.triggerJob.mockImplementation(() => ({ id: "job-123" }));
    mocks.createTransaction.mockReset();
    mocks.createTransactions.mockReset();
  });

  test("queues single created transaction", async () => {
    const created = createValidTransactionResponse();
    mocks.createTransaction.mockResolvedValueOnce(created);
    const response = await handlers().transactions_create!.handler(
      createTransactionInput(),
      {},
    );
    expect(response.isError).not.toBe(true);
    expect(mocks.triggerJob).toHaveBeenCalledWith(
      "enrich-transactions",
      { teamId: "team-a", transactionIds: [created.id] },
      "transactions",
    );
  });

  test("queues every transaction from a bulk import", async () => {
    const created = [
      createValidTransactionResponse(),
      createValidTransactionResponse({
        id: "c4c8d9e3-2f3b-4d4e-9f5a-6b7c8d9e0f1a",
      }),
    ];
    mocks.createTransactions.mockResolvedValueOnce(created);
    const response = await handlers().transactions_create_bulk!.handler(
      { transactions: [createTransactionInput(), createTransactionInput()] },
      {},
    );
    expect(response.isError).not.toBe(true);
    expect(mocks.triggerJob).toHaveBeenCalledWith(
      "enrich-transactions",
      { teamId: "team-a", transactionIds: created.map((t) => t.id) },
      "transactions",
    );
  });

  test("does not queue a failed creation", async () => {
    mocks.createTransaction.mockResolvedValueOnce(null);
    expect(
      (
        await handlers().transactions_create!.handler(
          createTransactionInput(),
          {},
        )
      ).isError,
    ).toBe(true);
    expect(mocks.triggerJob).not.toHaveBeenCalled();
  });
});
