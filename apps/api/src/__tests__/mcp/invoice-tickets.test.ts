import "../setup";
import { beforeEach, expect, mock, test } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../../mcp/types";
import { createValidInvoiceResponse } from "../factories/invoice";
import { mocks } from "../setup";

const tickets = [{ identifier: "ENG-99", title: "Moved work" }];
const snapshot = mock(
  async (..._args: unknown[]) => new Map([["issue-id", tickets[0]!]]),
);
mock.module("@api/services/linear", () => ({
  snapshotLinearIssuesForInvoice: snapshot,
}));
mock.module("@midday/invoice/templates/pdf", () => ({
  PdfTemplate: async () => null,
}));
const { registerInvoiceTools } = await import("../../mcp/tools/invoices");
const server = new McpServer({ name: "fixture", version: "1" });
registerInvoiceTools(server, {
  db: {},
  teamId: "test-team-id",
  userId: "test-user-id",
  scopes: ["invoices.read", "invoices.write"],
  apiUrl: "https://api.example",
} as McpContext);
const tools = (server as any)._registeredTools;

beforeEach(() => {
  snapshot.mockClear();
  mocks.draftInvoice.mockReset();
  mocks.draftInvoice.mockImplementation((_, args: any) => ({ id: args.id }));
  mocks.getInvoiceById.mockImplementation(() => createValidInvoiceResponse());
  mocks.getNextInvoiceNumber.mockImplementation(() => "FIXTURE-1");
  mocks.getCustomerById.mockImplementation(() => ({
    id: "customer-id",
    name: "Client",
  }));
  mocks.getInvoiceTemplate.mockImplementation(() => ({}));
  mocks.getTrackerProjectById.mockImplementation(() => ({
    customerId: "customer-id",
    name: "Client work",
    rate: 100,
    billable: true,
    currency: "USD",
  }));
  mocks.getTrackerRecordsByRange.mockImplementation(() => ({
    result: {
      "2026-11-01": [
        {
          id: "first",
          duration: 3600,
          linearIssues: [{ id: "issue-id", organizationId: "org-id" }],
        },
        {
          id: "second",
          duration: 7200,
          linearIssues: [{ id: "issue-id", organizationId: "org-id" }],
        },
      ],
    },
  }));
});

test.each([
  undefined,
  true,
])("connector includes tickets only on explicit opt-in (%s)", async (includeLinearTickets) => {
  const result = await tools.invoices_create_from_tracker.handler({
    projectId: "project-id",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-30",
    includeLinearTickets,
  });
  expect(result.isError).not.toBe(true);
  const saved = mocks.draftInvoice.mock.calls[0]![1] as any;
  expect(saved.lineItems[0]).toMatchObject({ quantity: 3, price: 100 });
  expect(saved.lineItems[0].tickets).toEqual(
    includeLinearTickets ? tickets : undefined,
  );
  expect(snapshot.mock.calls.length).toBe(includeLinearTickets ? 1 : 0);
  expect(
    saved.lineItems[0].details.map((detail: any) => detail.duration),
  ).toEqual([3600, 7200]);
  expect(
    saved.lineItems[0].details.map((detail: any) => detail.ticketIdentifiers),
  ).toEqual(
    includeLinearTickets ? [["ENG-99"], ["ENG-99"]] : [undefined, undefined],
  );
});

test("connector editing another invoice field preserves ticket snapshots and time details", async () => {
  const lineItems = [
    {
      name: "Work",
      quantity: 3,
      price: 100,
      tickets,
      details: [
        {
          title: "Planning",
          hours: 3,
          duration: 10800,
          ticketIdentifiers: ["ENG-99"],
        },
      ],
    },
  ];
  mocks.getInvoiceById.mockImplementation(() => ({
    ...createValidInvoiceResponse(),
    status: "draft",
    lineItems,
  }));
  const result = await tools.invoices_update_draft.handler({
    id: "invoice-id",
    note: "Thank you",
  });
  expect(result.isError).not.toBe(true);
  const saved = mocks.draftInvoice.mock.calls[0]![1] as any;
  expect(saved.lineItems[0].tickets).toEqual(tickets);
  expect(saved.lineItems[0].details).toEqual(lineItems[0]!.details);
  expect(snapshot).not.toHaveBeenCalled();
});
