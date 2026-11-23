import { formatAmount } from "@midday/utils/format";
import type { LineItem } from "../../../types";
import { calculateLineItemTotal } from "../../../utils/calculate";
import { Description } from "./description";
import { InvoiceWorkLog } from "./work-log";

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
          <InvoiceWorkLog item={item} locale={locale} />
        </div>
      ))}
    </div>
  );
}
