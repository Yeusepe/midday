import { Text, View } from "@react-pdf/renderer";
import {
  calculateConvertedAmount,
  calculateTotal,
} from "../../../utils/calculate";
import { formatCurrencyForPDF } from "../../../utils/pdf-format";

interface SummaryProps {
  amount?: number | null;
  subtotal?: number | null;
  tax?: number | null;
  taxRate?: number;
  vat?: number | null;
  vatRate?: number;
  currency?: string | null;
  exchangeRate?: number | null;
  convertedCurrency?: string | null;
  convertedAmount?: number | null;
  totalLabel: string;
  taxLabel: string;
  vatLabel: string;
  locale: string;
  discount?: number | null;
  discountLabel: string;
  includeDiscount: boolean;
  includeVat: boolean;
  includeTax: boolean;
  includeLineItemTax?: boolean;
  includeDecimals: boolean;
  subtotalLabel: string;
  lineItems: { price?: number; quantity?: number; taxRate?: number }[];
}

export function Summary({
  amount,
  subtotal,
  tax,
  taxRate,
  vat,
  vatRate,
  currency,
  exchangeRate,
  convertedCurrency,
  convertedAmount,
  totalLabel,
  taxLabel,
  vatLabel,
  locale,
  discount,
  discountLabel,
  includeDiscount,
  includeVat,
  includeTax,
  includeLineItemTax,
  includeDecimals,
  subtotalLabel,
  lineItems,
}: SummaryProps) {
  // Calculate subtotal dynamically from line items (same as HTML template)
  const { subTotal: calculatedSubtotal, tax: calculatedTax } = calculateTotal({
    lineItems,
    taxRate: taxRate ?? 0,
    vatRate: vatRate ?? 0,
    discount: discount ?? 0,
    includeVat,
    includeTax,
    includeLineItemTax,
  });

  const hasRateCurrency =
    convertedCurrency && convertedCurrency !== currency && exchangeRate;
  const displayTotal =
    amount ??
    (hasRateCurrency
      ? calculateConvertedAmount({
          amount:
            calculatedSubtotal +
            (includeVat ? (calculatedSubtotal * (vatRate ?? 0)) / 100 : 0) +
            calculatedTax -
            (discount ?? 0),
          exchangeRate,
        })
      : 0);
  const displaySubtotal =
    subtotal ??
    (hasRateCurrency
      ? calculateConvertedAmount({ amount: calculatedSubtotal, exchangeRate })
      : calculatedSubtotal);
  const displayDiscount = hasRateCurrency
    ? calculateConvertedAmount({ amount: discount ?? 0, exchangeRate })
    : (discount ?? 0);
  const displayVat =
    vat ??
    (hasRateCurrency
      ? calculateConvertedAmount({
          amount: (calculatedSubtotal * (vatRate ?? 0)) / 100,
          exchangeRate,
        })
      : 0);
  const displayTax =
    tax ??
    (hasRateCurrency
      ? calculateConvertedAmount({ amount: calculatedTax, exchangeRate })
      : calculatedTax);

  return (
    <View
      style={{
        marginTop: 60,
        marginBottom: 40,
        alignItems: "flex-end",
        marginLeft: "auto",
        width: 250,
      }}
    >
      <View style={{ flexDirection: "row", marginBottom: 5, width: "100%" }}>
        <Text style={{ fontSize: 9, flex: 1 }}>{subtotalLabel}</Text>
        <Text style={{ fontSize: 9, textAlign: "right" }}>
          {currency &&
            formatCurrencyForPDF({
              amount: displaySubtotal ?? 0,
              currency,
              locale,
              maximumFractionDigits: getCurrencyFractionDigits(
                displaySubtotal ?? 0,
                includeDecimals,
              ),
            })}
        </Text>
      </View>

      {includeDiscount && discount != null && discount !== 0 && (
        <View style={{ flexDirection: "row", marginBottom: 5, width: "100%" }}>
          <Text style={{ fontSize: 9, flex: 1 }}>{discountLabel}</Text>
          <Text style={{ fontSize: 9, textAlign: "right" }}>
            {currency &&
              formatCurrencyForPDF({
                amount: displayDiscount ?? 0,
                currency,
                locale,
                maximumFractionDigits: getCurrencyFractionDigits(
                  displayDiscount ?? 0,
                  includeDecimals,
                ),
              })}
          </Text>
        </View>
      )}

      {includeVat && (
        <View style={{ flexDirection: "row", marginBottom: 5, width: "100%" }}>
          <Text style={{ fontSize: 9, flex: 1 }}>
            {vatLabel} ({String(vatRate ?? 0)}%)
          </Text>
          <Text style={{ fontSize: 9, textAlign: "right" }}>
            {currency &&
              formatCurrencyForPDF({
                amount: displayVat ?? 0,
                currency,
                locale,
                maximumFractionDigits: 2,
              })}
          </Text>
        </View>
      )}

      {includeTax && !includeLineItemTax && (
        <View style={{ flexDirection: "row", marginBottom: 5, width: "100%" }}>
          <Text style={{ fontSize: 9, flex: 1 }}>
            {taxLabel} ({String(taxRate ?? 0)}%)
          </Text>
          <Text style={{ fontSize: 9, textAlign: "right" }}>
            {currency &&
              formatCurrencyForPDF({
                amount: displayTax ?? 0,
                currency,
                locale,
                maximumFractionDigits: 2,
              })}
          </Text>
        </View>
      )}

      {includeLineItemTax && (displayTax ?? 0) > 0 && (
        <View style={{ flexDirection: "row", marginBottom: 5, width: "100%" }}>
          <Text style={{ fontSize: 9, flex: 1 }}>{taxLabel}</Text>
          <Text style={{ fontSize: 9, textAlign: "right" }}>
            {currency &&
              formatCurrencyForPDF({
                amount: displayTax ?? 0,
                currency,
                locale,
                maximumFractionDigits: 2,
              })}
          </Text>
        </View>
      )}

      <View
        style={{
          flexDirection: "row",
          marginTop: 5,
          borderTopWidth: 0.5,
          borderTopColor: "#000",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 5,
          width: "100%",
        }}
      >
        <Text style={{ fontSize: 9, marginRight: 10 }}>{totalLabel}</Text>
        <Text style={{ fontSize: 21 }}>
          {currency &&
            formatCurrencyForPDF({
              amount: displayTotal ?? 0,
              currency,
              locale,
              maximumFractionDigits:
                includeTax || includeVat || includeLineItemTax
                  ? 2
                  : getCurrencyFractionDigits(
                      displayTotal ?? 0,
                      includeDecimals,
                    ),
            })}
        </Text>
      </View>

      {currency &&
        convertedCurrency &&
        convertedAmount != null &&
        exchangeRate && (
          <View
            style={{
              marginTop: 10,
              borderTopWidth: 0.5,
              borderTopColor: "#000",
              paddingTop: 5,
              width: "100%",
            }}
          >
            <View style={{ flexDirection: "row", marginBottom: 5 }}>
              <Text style={{ fontSize: 9, flex: 1 }}>Exchange rate</Text>
              <Text style={{ fontSize: 9, textAlign: "right" }}>
                1 {convertedCurrency} ={" "}
                {new Intl.NumberFormat(locale, {
                  maximumFractionDigits: 8,
                }).format(exchangeRate)}{" "}
                {currency}
              </Text>
            </View>
            <View style={{ flexDirection: "row" }}>
              <Text style={{ fontSize: 9, flex: 1 }}>
                {convertedCurrency} total
              </Text>
              <Text style={{ fontSize: 15, textAlign: "right" }}>
                {formatCurrencyForPDF({
                  amount: convertedAmount,
                  currency: convertedCurrency,
                  locale,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
          </View>
        )}
    </View>
  );
}

function getCurrencyFractionDigits(amount: number, includeDecimals?: boolean) {
  return includeDecimals || !Number.isInteger(amount) ? 2 : 0;
}
