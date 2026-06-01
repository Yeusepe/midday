import type { LineItem } from "../../../types";
import {
  calculateConvertedAmount,
  calculateTotal,
} from "../../../utils/calculate";

type Props = {
  includeVat: boolean;
  includeTax: boolean;
  includeDiscount: boolean;
  amount?: number | null;
  subtotal?: number | null;
  includeLineItemTax?: boolean;
  discount?: number | null;
  discountLabel: string;
  tax?: number | null;
  taxRate: number;
  vat?: number | null;
  vatRate: number;
  locale: string;
  currency: string | null;
  exchangeRate?: number | null;
  convertedCurrency?: string | null;
  convertedAmount?: number | null;
  vatLabel: string;
  taxLabel: string;
  totalLabel: string;
  lineItems: LineItem[];
  includeDecimals?: boolean;
  subtotalLabel: string;
};

export function Summary({
  includeVat,
  includeTax,
  includeDiscount,
  amount,
  subtotal,
  includeLineItemTax,
  discountLabel,
  locale,
  discount,
  tax,
  taxRate,
  vat,
  vatRate,
  currency,
  exchangeRate,
  convertedCurrency,
  convertedAmount,
  vatLabel,
  taxLabel,
  totalLabel,
  lineItems,
  includeDecimals,
  subtotalLabel,
}: Props) {
  const maximumFractionDigits = includeDecimals ? 2 : 0;

  const {
    subTotal,
    total,
    vat: totalVAT,
    tax: totalTax,
  } = calculateTotal({
    lineItems,
    taxRate,
    vatRate,
    discount: discount ?? 0,
    includeVat,
    includeTax,
    includeLineItemTax,
  });

  const hasRateCurrency =
    convertedCurrency && convertedCurrency !== currency && exchangeRate;
  const displaySubtotal =
    subtotal ??
    (hasRateCurrency
      ? calculateConvertedAmount({ amount: subTotal, exchangeRate })
      : subTotal);
  const displayDiscount = hasRateCurrency
    ? calculateConvertedAmount({ amount: discount ?? 0, exchangeRate })
    : (discount ?? 0);
  const displayVat =
    vat ??
    (hasRateCurrency
      ? calculateConvertedAmount({ amount: totalVAT, exchangeRate })
      : totalVAT);
  const displayTax =
    tax ??
    (hasRateCurrency
      ? calculateConvertedAmount({ amount: totalTax, exchangeRate })
      : totalTax);
  const displayTotal =
    amount ??
    (hasRateCurrency
      ? calculateConvertedAmount({ amount: total, exchangeRate })
      : total);

  return (
    <div className="w-[320px] flex flex-col">
      <div className="flex justify-between items-center py-1">
        <span className="text-[11px] text-[#878787] font-mono">
          {subtotalLabel}
        </span>
        <span className="text-right text-[11px] text-[#878787]">
          {currency &&
            new Intl.NumberFormat(locale, {
              style: "currency",
              currency: currency,
              maximumFractionDigits,
            }).format(displaySubtotal ?? 0)}
        </span>
      </div>

      {includeDiscount && (
        <div className="flex justify-between items-center py-1">
          <span className="text-[11px] text-[#878787] font-mono">
            {discountLabel}
          </span>
          <span className="text-right text-[11px] text-[#878787]">
            {currency &&
              new Intl.NumberFormat(locale, {
                style: "currency",
                currency: currency,
                maximumFractionDigits,
              }).format(displayDiscount ?? 0)}
          </span>
        </div>
      )}

      {includeVat && (
        <div className="flex justify-between items-center py-1">
          <span className="text-[11px] text-[#878787] font-mono">
            {vatLabel} ({vatRate}%)
          </span>
          <span className="text-right text-[11px] text-[#878787]">
            {currency &&
              new Intl.NumberFormat(locale, {
                style: "currency",
                currency: currency,
                maximumFractionDigits: 2,
              }).format(displayVat ?? 0)}
          </span>
        </div>
      )}

      {includeTax && !includeLineItemTax && (
        <div className="flex justify-between items-center py-1">
          <span className="text-[11px] text-[#878787] font-mono">
            {taxLabel} ({taxRate}%)
          </span>
          <span className="text-right text-[11px] text-[#878787]">
            {currency &&
              new Intl.NumberFormat(locale, {
                style: "currency",
                currency: currency,
                maximumFractionDigits: 2,
              }).format(displayTax ?? 0)}
          </span>
        </div>
      )}

      {includeLineItemTax && totalTax > 0 && (
        <div className="flex justify-between items-center py-1">
          <span className="text-[11px] text-[#878787] font-mono">
            {taxLabel}
          </span>
          <span className="text-right text-[11px] text-[#878787]">
            {currency &&
              new Intl.NumberFormat(locale, {
                style: "currency",
                currency: currency,
                maximumFractionDigits: 2,
              }).format(displayTax ?? 0)}
          </span>
        </div>
      )}

      <div className="flex justify-between items-center py-4 mt-2 border-t border-border">
        <span className="text-[11px] text-[#878787] font-mono">
          {totalLabel}
        </span>
        <span className="text-right text-[21px]">
          {currency &&
            new Intl.NumberFormat(locale, {
              style: "currency",
              currency: currency,
              maximumFractionDigits:
                includeTax || includeVat || includeLineItemTax
                  ? 2
                  : maximumFractionDigits,
            }).format(displayTotal ?? 0)}
        </span>
      </div>

      {currency &&
        convertedCurrency &&
        convertedAmount != null &&
        exchangeRate && (
          <div className="border-t border-border pt-3 space-y-1">
            <div className="flex justify-between items-center py-1">
              <span className="text-[11px] text-[#878787] font-mono">
                Exchange rate
              </span>
              <span className="text-right text-[11px] text-[#878787]">
                1 {convertedCurrency} ={" "}
                {new Intl.NumberFormat(locale, {
                  maximumFractionDigits: 8,
                }).format(exchangeRate)}{" "}
                {currency}
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[11px] text-[#878787] font-mono">
                {convertedCurrency} total
              </span>
              <span className="text-right text-[15px]">
                {new Intl.NumberFormat(locale, {
                  style: "currency",
                  currency: convertedCurrency,
                  maximumFractionDigits: 2,
                }).format(convertedAmount)}
              </span>
            </div>
          </div>
        )}
    </div>
  );
}
