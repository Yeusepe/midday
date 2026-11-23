import type { LineItemDetail, LineItemTicket } from "@midday/invoice/types";

export type TrackerInvoiceEntry = {
  id: string;
  date?: string | null;
  duration?: number | null;
  description?: string | null;
  start?: string | Date | null;
};

export const durationToHours = (duration?: number | null) =>
  Math.round(((duration ?? 0) / 3600) * 100) / 100;

export function getTrackerEntryDate(entry: TrackerInvoiceEntry) {
  if (entry.date) return entry.date;
  if (!entry.start) return null;
  const date = new Date(entry.start);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function sortTrackerInvoiceEntries<T extends TrackerInvoiceEntry>(
  entries: T[],
): T[] {
  return [...entries].sort(
    (a, b) =>
      (getTrackerEntryDate(a) ?? "").localeCompare(
        getTrackerEntryDate(b) ?? "",
      ) || new Date(a.start ?? 0).getTime() - new Date(b.start ?? 0).getTime(),
  );
}

export function buildTrackerEntryDetail(
  entry: TrackerInvoiceEntry,
  fallbackTitle: string,
  tickets?: LineItemTicket[],
): LineItemDetail {
  return {
    date: getTrackerEntryDate(entry),
    title: entry.description?.trim() || fallbackTitle,
    description: null,
    hours: durationToHours(entry.duration),
    duration: entry.duration ?? null,
    ticketIdentifiers: tickets?.map((ticket) => ticket.identifier),
  };
}
