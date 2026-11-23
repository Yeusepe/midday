import type { LineItem } from "../../../types";
import {
  formatWorkLogDate,
  formatWorkLogTime,
  getWorkLogDetails,
  getWorkLogTicketIdentifiers,
} from "../../../utils/work-log";

export function InvoiceWorkLog({
  item,
  locale,
}: {
  item: LineItem;
  locale: string;
}) {
  const details = getWorkLogDetails(item);
  if (!details.length && !item.tickets?.length) return null;

  return (
    <div className="col-span-full mb-4 min-w-0 font-mono">
      {details.length > 0 && (
        <section aria-label="Time entries" className="mt-3">
          <div className="mb-3 flex items-baseline justify-between gap-3 text-[11px]">
            <h3>Time entries</h3>
            <span className="text-[#878787]">
              {details.length} {details.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <div
            className="hidden grid-cols-[96px_minmax(0,1fr)_80px] gap-4 border-b border-border pb-2 text-[10px] text-[#878787] sm:grid"
            aria-hidden="true"
          >
            <span>Date</span>
            <span>Work completed</span>
            <span className="text-right">Time</span>
          </div>
          <ol>
            {details.map((detail, index) => {
              const sameDay = Boolean(
                detail.date && detail.date === details[index - 1]?.date,
              );
              const identifiers = getWorkLogTicketIdentifiers(item, detail);
              return (
                <li
                  key={`detail-${index}`}
                  className={`grid grid-cols-[minmax(0,1fr)_80px] gap-x-4 gap-y-2 py-3 text-[11px] sm:grid-cols-[96px_minmax(0,1fr)_80px] ${sameDay ? "" : "border-t border-border sm:first:border-t-0"}`}
                >
                  <div
                    className={`text-[10px] leading-5 text-[#878787] ${sameDay ? "sm:invisible" : ""}`}
                  >
                    <time dateTime={detail.date ?? undefined}>
                      {formatWorkLogDate(detail.date, locale)}
                    </time>
                  </div>
                  <div className="col-span-full row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                    {detail.title && (
                      <p className="whitespace-pre-wrap break-words leading-5">
                        {detail.title}
                      </p>
                    )}
                    {detail.description && (
                      <p className="mt-1 whitespace-pre-wrap break-words leading-5 text-[#878787]">
                        {detail.description}
                      </p>
                    )}
                    {identifiers.length > 0 && (
                      <ul
                        aria-label="Tickets for this entry"
                        className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#878787]"
                      >
                        {identifiers.map((id) => (
                          <li key={id} className="break-all">
                            {id}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="col-start-2 row-start-1 text-right text-[11px] tabular-nums leading-5 sm:col-start-3">
                    {formatWorkLogTime(detail)}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      {!!item.tickets?.length && (
        <section
          aria-label="Ticket reference"
          className="mt-3 border-t border-border pt-3"
        >
          <h3 className="mb-2 text-[11px] text-[#878787]">Ticket reference</h3>
          <ul className="space-y-2">
            {item.tickets.map((ticket, index) => (
              <li
                key={`${ticket.identifier}-${index}`}
                className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-4 text-[10px] leading-5 sm:grid-cols-[96px_minmax(0,1fr)]"
              >
                <span className="break-words text-[#878787]">
                  {ticket.identifier}
                </span>
                <span className="min-w-0 whitespace-pre-wrap break-words">
                  {ticket.title}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
