import { formatAmount } from "@midday/utils/format";
import type { LineItem } from "../../../types";
import { calculateLineItemTotal } from "../../../utils/calculate";
import { Description } from "./description";

type Props = {
  lineItems: LineItem[];
  currency: string | null;
  descriptionLabel: string;
  quantityLabel: string;
  priceLabel: string;
  totalLabel: string;
  includeDecimals?: boolean;
  locale: string;
  includeUnits?: boolean;
  includeLineItemTax?: boolean;
  lineItemTaxLabel?: string;
};

export function LineItems({
  lineItems,
  currency,
  descriptionLabel,
  quantityLabel,
  priceLabel,
  totalLabel,
  includeDecimals = false,
  includeUnits = false,
  includeLineItemTax = false,
  lineItemTaxLabel = "Tax",
  locale,
}: Props) {
  const maximumFractionDigits = includeDecimals ? 2 : 0;

  const gridCols = includeLineItemTax
    ? "grid-cols-[minmax(0,1fr)_10%_20%_10%_24%] sm:grid-cols-[minmax(0,1.5fr)_12%_12%_12%_15%]"
    : "grid-cols-[minmax(0,1fr)_15%_22%_24%] sm:grid-cols-[minmax(0,1.5fr)_15%_15%_15%]";

  return (
    <div className="mt-5 font-mono break-words">
      <div
        className={`grid ${gridCols} gap-2 sm:gap-4 items-end relative group mb-2 w-full pb-1 border-b border-border`}
      >
        <div className="text-[11px] text-[#878787]">{descriptionLabel}</div>
        <div className="text-[11px] text-[#878787]">{quantityLabel}</div>
        <div className="text-[11px] text-[#878787]">{priceLabel}</div>
        {includeLineItemTax && (
          <div className="text-[11px] text-[#878787]">{lineItemTaxLabel}</div>
        )}
        <div className="text-[11px] text-[#878787] text-right">
          {totalLabel}
        </div>
      </div>

      {lineItems.map((item, index) => (
        <div
          key={`line-item-${index.toString()}`}
          className={`grid ${gridCols} gap-2 sm:gap-4 items-start relative group mb-1 w-full py-1`}
        >
          <div className="self-start">
            <Description content={item.name} />
            <LineItemDetails item={item} locale={locale} />
          </div>
          <div className="text-[11px] self-start">{item.quantity ?? 0}</div>
          <div className="text-[11px] self-start">
            {currency && (
              <>
                <span>
                  {formatAmount({
                    currency,
                    amount: item.price ?? 0,
                    maximumFractionDigits,
                    locale,
                  })}
                </span>
                {includeUnits && item.unit && (
                  <span className="block text-[10px] text-[#878787] sm:inline">
                    {" "}
                    / {item.unit}
                  </span>
                )}
              </>
            )}
          </div>
          {includeLineItemTax && (
            <div className="text-[11px] self-start">
              {item.taxRate != null ? `${item.taxRate}%` : "0%"}
            </div>
          )}
          <div className="text-[11px] text-right self-start">
            {currency &&
              formatAmount({
                maximumFractionDigits,
                currency,
                amount: calculateLineItemTotal({
                  price: item.price,
                  quantity: item.quantity,
                }),
                locale,
              })}
          </div>
          {!!item.tickets?.length && (
            <section className="col-span-full mb-3 border-t border-border pt-3">
              <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[#707070]">
                Related tickets
              </h3>
              <ul className="divide-y divide-border">
                {item.tickets.map((ticket, ticketIndex) => (
                  <li
                    key={`${ticket.identifier}-${ticketIndex}`}
                    className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-x-4 py-1.5 text-[11px] leading-relaxed"
                  >
                    <span className="max-w-[120px] break-words text-[#707070]">
                      {ticket.identifier}
                    </span>
                    <span className="min-w-0 whitespace-pre-wrap break-words font-sans">
                      {ticket.title}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ))}
    </div>
  );
}

function LineItemDetails({ item, locale }: { item: LineItem; locale: string }) {
  const details = item.details?.filter(
    (detail) =>
      detail.date || detail.title || detail.description || detail.hours != null,
  );

  if (!details?.length) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1 text-[10px] text-[#878787]">
      {details.map((detail, index) => (
        <div
          key={`${detail.date ?? ""}-${detail.title ?? ""}-${index.toString()}`}
          className="border-l border-border pl-2"
        >
          <div className="flex flex-wrap gap-x-2">
            {detail.date && (
              <span>
                {new Intl.DateTimeFormat(locale, {
                  timeZone: "UTC",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }).format(new Date(detail.date))}
              </span>
            )}
            {detail.title && (
              <span className="text-primary">{detail.title}</span>
            )}
            {detail.hours != null && <span>{detail.hours}h</span>}
          </div>
          {detail.description && (
            <div className="whitespace-pre-wrap leading-4">
              {detail.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
