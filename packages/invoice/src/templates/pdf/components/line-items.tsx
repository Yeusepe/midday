import { Text, View } from "@react-pdf/renderer";
import type { LineItem } from "../../../types";
import { calculateLineItemTotal } from "../../../utils/calculate";
import { formatCurrencyForPDF } from "../../../utils/pdf-format";
import { Description } from "./description";

type Props = {
  lineItems: LineItem[];
  currency: string | null;
  descriptionLabel: string;
  quantityLabel: string;
  priceLabel: string;
  totalLabel: string;
  locale: string;
  includeDecimals?: boolean;
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
  locale,
  includeDecimals,
  includeUnits,
  includeLineItemTax = false,
  lineItemTaxLabel = "Tax",
}: Props) {
  const columnWidths = getColumnWidths(includeLineItemTax);
  const headerPositions = getHeaderPositions(includeLineItemTax);
  const lineItemTotal = (item: LineItem) =>
    calculateLineItemTotal({
      price: item.price,
      quantity: item.quantity,
    });

  return (
    <View style={{ marginTop: 20 }}>
      <View
        style={{
          borderBottomWidth: 0.5,
          borderBottomColor: "#000",
          height: 22,
          marginBottom: 6,
        }}
      >
        <Text
          style={{
            position: "absolute",
            left: headerPositions.description,
            top: 0,
            width: columnWidths.description,
            fontSize: 9,
            lineHeight: 11,
            fontWeight: 500,
          }}
        >
          {descriptionLabel}
        </Text>
        <Text
          style={{
            position: "absolute",
            left: headerPositions.quantity,
            top: 0,
            width: columnWidths.value,
            fontSize: 9,
            lineHeight: 11,
            fontWeight: 500,
          }}
        >
          {quantityLabel}
        </Text>
        <Text
          style={{
            position: "absolute",
            left: headerPositions.price,
            top: 0,
            width: columnWidths.value,
            fontSize: 9,
            lineHeight: 11,
            fontWeight: 500,
          }}
        >
          {priceLabel}
        </Text>
        {includeLineItemTax && (
          <Text
            style={{
              position: "absolute",
              left: headerPositions.tax,
              top: 0,
              width: columnWidths.value,
              fontSize: 9,
              lineHeight: 11,
              fontWeight: 500,
            }}
          >
            {lineItemTaxLabel}
          </Text>
        )}
        <Text
          style={{
            position: "absolute",
            left: headerPositions.total,
            top: 0,
            width: columnWidths.value,
            fontSize: 9,
            lineHeight: 11,
            fontWeight: 500,
            textAlign: "right",
          }}
        >
          {totalLabel}
        </Text>
      </View>
      {lineItems.map((item, index) => (
        <View
          key={`line-item-${index.toString()}`}
          style={{ paddingVertical: 5 }}
        >
          <View
            wrap={false}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
            }}
          >
            <View style={{ width: columnWidths.description, paddingRight: 20 }}>
              <Description content={item.name} />
            </View>

            <Text style={{ width: columnWidths.value, fontSize: 9 }}>
              {String(item.quantity ?? 0)}
            </Text>

            <Text style={{ width: columnWidths.value, fontSize: 9 }}>
              {currency &&
                formatCurrencyForPDF({
                  amount: item.price ?? 0,
                  currency,
                  locale,
                  maximumFractionDigits: getCurrencyFractionDigits(
                    item.price ?? 0,
                    includeDecimals,
                  ),
                })}
              {includeUnits && item.unit ? ` / ${item.unit}` : null}
            </Text>

            {includeLineItemTax && (
              <Text style={{ width: columnWidths.value, fontSize: 9 }}>
                {item.taxRate != null ? `${item.taxRate}%` : "0%"}
              </Text>
            )}

            <Text
              style={{
                width: columnWidths.value,
                fontSize: 9,
                textAlign: "right",
              }}
            >
              {currency &&
                formatCurrencyForPDF({
                  amount: lineItemTotal(item),
                  currency,
                  locale,
                  maximumFractionDigits: getCurrencyFractionDigits(
                    lineItemTotal(item),
                    includeDecimals,
                  ),
                })}
            </Text>
          </View>

          <LineItemDetails
            item={item}
            locale={locale}
            width={columnWidths.description}
          />
        </View>
      ))}
    </View>
  );
}

function getColumnWidths(includeLineItemTax: boolean) {
  return includeLineItemTax
    ? { description: "42.857%", value: "14.285%" }
    : { description: "50%", value: "16.666%" };
}

function getHeaderPositions(includeLineItemTax: boolean) {
  return includeLineItemTax
    ? {
        description: "0%",
        quantity: "42.857%",
        price: "57.142%",
        tax: "71.427%",
        total: "85.712%",
      }
    : {
        description: "0%",
        quantity: "50%",
        price: "66.666%",
        tax: "0%",
        total: "83.332%",
      };
}

function getCurrencyFractionDigits(amount: number, includeDecimals?: boolean) {
  return includeDecimals || !Number.isInteger(amount) ? 2 : 0;
}

function LineItemDetails({
  item,
  locale,
  width,
}: {
  item: LineItem;
  locale: string;
  width: string;
}) {
  const details = item.details?.filter(
    (detail) =>
      detail.date || detail.title || detail.description || detail.hours != null,
  );

  if (!details?.length) {
    return null;
  }

  return (
    <View style={{ marginTop: 4, width, paddingRight: 20 }}>
      {details.map((detail, index) => (
        <View
          key={`${detail.date ?? ""}-${detail.title ?? ""}-${index.toString()}`}
          style={{
            borderLeftWidth: 0.5,
            borderLeftColor: "#878787",
            paddingLeft: 5,
            marginTop: 3,
          }}
        >
          <Text style={{ fontSize: 7, color: "#878787" }}>
            {[
              detail.date
                ? new Intl.DateTimeFormat(locale, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(detail.date))
                : null,
              detail.title,
              detail.hours != null ? `${detail.hours}h` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {detail.description && (
            <Text style={{ fontSize: 7, color: "#878787", marginTop: 2 }}>
              {detail.description}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
