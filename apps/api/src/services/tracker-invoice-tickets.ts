import type { Database } from "@midday/db/client";
import type { LinearIssueRef } from "@midday/db/schema";
import type { LineItemTicket } from "@midday/invoice/types";
import { snapshotLinearIssuesForInvoice } from "./linear";

export async function getTrackerInvoiceTickets(
  db: Database,
  teamId: string,
  userId: string,
  entries: { id: string; linearIssues?: LinearIssueRef[] }[],
) {
  const snapshots = await snapshotLinearIssuesForInvoice(
    db,
    teamId,
    userId,
    entries.flatMap((entry) => entry.linearIssues ?? []),
  );
  const forEntry = new Map<string, LineItemTicket[]>();
  for (const entry of entries) {
    const ids = [...new Set(entry.linearIssues?.map((issue) => issue.id))];
    forEntry.set(
      entry.id,
      ids.map((id) => snapshots.get(id)!),
    );
  }
  return { forEntry, all: [...snapshots.values()] };
}
