import type { LineItem, LineItemDetail } from "../types";

export function getWorkLogDetails(item: LineItem) {
  return (item.details ?? []).filter(
    (detail) =>
      detail.date ||
      detail.title ||
      detail.description ||
      detail.hours != null ||
      detail.duration != null ||
      detail.ticketIdentifiers?.length,
  );
}

export function formatWorkLogDate(
  date: string | null | undefined,
  locale: string,
) {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function formatWorkLogTime(detail: LineItemDetail) {
  // If a client edits the hours without updating the duration, honor that edit.
  if (
    detail.duration != null &&
    (detail.hours == null ||
      Math.round((detail.duration / 3600) * 100) / 100 === detail.hours)
  ) {
    const seconds = Math.max(0, Math.round(detail.duration));
    return `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  return detail.hours != null ? `${detail.hours}h` : "";
}

export function getWorkLogTicketIdentifiers(
  item: LineItem,
  detail: LineItemDetail,
) {
  const included = new Set(item.tickets?.map((ticket) => ticket.identifier));
  // Older invoices have a flat ticket list. Do not invent session associations.
  return [...new Set(detail.ticketIdentifiers ?? [])].filter((id) =>
    included.has(id),
  );
}

export function replaceWorkLogTicketIdentifier(
  details: LineItemDetail[] | undefined,
  previous: string,
  next: string | null,
): LineItemDetail[] {
  return (details ?? []).map((detail) => ({
    ...detail,
    ...(detail.ticketIdentifiers && {
      ticketIdentifiers: [
        ...new Set(
          detail.ticketIdentifiers.flatMap((id) =>
            id === previous ? (next !== null ? [next] : []) : [id],
          ),
        ),
      ],
    }),
  }));
}
