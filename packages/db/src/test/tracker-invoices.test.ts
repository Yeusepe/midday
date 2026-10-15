import { describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { draftInvoiceFromTracker } from "../queries/invoices";

const invoiceData = {
  id: "invoice-id",
  teamId: "team-id",
  userId: "user-id",
  token: "test-token",
  template: { currency: "USD" },
  invoiceNumber: "INV-001",
  issueDate: "2026-05-01",
  dueDate: "2026-05-31",
  trackerEntryIds: ["entry-1", "entry-2"],
  uninvoicedOnly: true,
};

function createDatabase(linkedEntryIds = ["entry-1", "entry-2"]) {
  const saveDraft = mock(async () => [{ id: invoiceData.id }]);
  const where = mock((_condition: SQL) => ({
    returning: async () => linkedEntryIds.map((id) => ({ id })),
  }));
  const set = mock((_values: { invoiceId: string }) => ({ where }));
  const tx = {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({ returning: saveDraft }),
      }),
    }),
    update: () => ({ set }),
  };
  const transaction = mock(
    async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  );

  return { db: { transaction }, saveDraft, set, where };
}

describe("tracker invoice linking", () => {
  test("saves the draft and claims only its uninvoiced entries in one transaction", async () => {
    const { db, set, where } = createDatabase();
    const result = await draftInvoiceFromTracker(db as never, invoiceData);

    expect(result?.id).toBe("invoice-id");
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ invoiceId: "invoice-id" });

    const query = new PgDialect().sqlToQuery(where.mock.calls[0]![0]);
    expect(query.sql).toContain('"tracker_entries"."team_id" =');
    expect(query.sql).toContain('"tracker_entries"."id" in');
    expect(query.sql).toContain('"tracker_entries"."billed" is not true');
    expect(query.sql).toContain('"tracker_entries"."invoice_id" is null');
    expect(query.params).toEqual(["team-id", "entry-1", "entry-2"]);
  });

  test("rejects the transaction when another invoice already claimed an entry", async () => {
    const { db } = createDatabase(["entry-1"]);

    await expect(
      draftInvoiceFromTracker(db as never, invoiceData),
    ).rejects.toThrow("TRACKER_ENTRIES_ALREADY_INVOICED");
  });

  test("does not claim time when saving the draft fails", async () => {
    const { db, saveDraft, set } = createDatabase();
    saveDraft.mockRejectedValue(new Error("Draft save failed"));

    await expect(
      draftInvoiceFromTracker(db as never, invoiceData),
    ).rejects.toThrow("Draft save failed");
    expect(set).not.toHaveBeenCalled();
  });
});
