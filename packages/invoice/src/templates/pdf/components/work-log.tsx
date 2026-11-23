import { Text, View } from "@react-pdf/renderer";
import type { LineItem } from "../../../types";
import {
  formatWorkLogDate,
  formatWorkLogTime,
  getWorkLogDetails,
  getWorkLogTicketIdentifiers,
} from "../../../utils/work-log";

export function PdfWorkLog({
  item,
  locale,
}: {
  item: LineItem;
  locale: string;
}) {
  const details = getWorkLogDetails(item);
  if (!details.length && !item.tickets?.length) return null;

  return (
    <View style={{ marginTop: 12, marginBottom: 10 }}>
      {details.length > 0 && (
        <View>
          <View minPresenceAhead={55}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 9,
              }}
            >
              <Text style={{ fontSize: 9 }}>Time entries</Text>
              <Text style={{ fontSize: 8, color: "#878787" }}>
                {details.length} {details.length === 1 ? "entry" : "entries"}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                borderBottomWidth: 0.5,
                borderBottomColor: "#dedede",
                paddingBottom: 5,
                fontSize: 8,
                color: "#878787",
              }}
            >
              <Text style={{ width: 85 }}>Date</Text>
              <Text style={{ flex: 1 }}>Work completed</Text>
              <Text style={{ width: 60, textAlign: "right" }}>Time</Text>
            </View>
          </View>
          {details.map((detail, index) => {
            const identifiers = getWorkLogTicketIdentifiers(item, detail);
            return (
              <View
                key={`detail-${index}`}
                wrap={
                  (detail.title?.length ?? 0) +
                    (detail.description?.length ?? 0) +
                    identifiers.join(" ").length >
                  1500
                }
                style={{
                  flexDirection: "row",
                  paddingVertical: 6,
                  borderBottomWidth: 0.5,
                  borderBottomColor: "#ededed",
                }}
              >
                <Text
                  style={{
                    width: 85,
                    paddingRight: 12,
                    fontSize: 8,
                    color: "#878787",
                    lineHeight: 1.5,
                  }}
                >
                  {formatWorkLogDate(detail.date, locale)}
                </Text>
                <View style={{ flex: 1, paddingRight: 20 }}>
                  {detail.title && (
                    <Text style={{ fontSize: 9, lineHeight: 1.5 }}>
                      {detail.title}
                    </Text>
                  )}
                  {detail.description && (
                    <Text
                      style={{
                        marginTop: 3,
                        fontSize: 8,
                        lineHeight: 1.5,
                        color: "#878787",
                      }}
                    >
                      {detail.description}
                    </Text>
                  )}
                  {identifiers.length > 0 && (
                    <Text
                      style={{
                        marginTop: 4,
                        fontSize: 8,
                        lineHeight: 1.5,
                        color: "#878787",
                      }}
                    >
                      {identifiers.join("   ")}
                    </Text>
                  )}
                </View>
                <Text
                  style={{
                    width: 60,
                    fontSize: 9,
                    lineHeight: 1.5,
                    textAlign: "right",
                  }}
                >
                  {formatWorkLogTime(detail)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      {!!item.tickets?.length && (
        <View style={{ marginTop: 12 }}>
          <Text
            minPresenceAhead={30}
            style={{ fontSize: 8, color: "#878787", marginBottom: 5 }}
          >
            Ticket reference
          </Text>
          {item.tickets.map((ticket, index) => (
            <View
              key={`${ticket.identifier}-${index}`}
              wrap={false}
              style={{ flexDirection: "row", paddingVertical: 3 }}
            >
              <Text
                style={{
                  width: 85,
                  paddingRight: 12,
                  fontSize: 8,
                  lineHeight: 1.5,
                  color: "#878787",
                }}
              >
                {ticket.identifier}
              </Text>
              <Text style={{ flex: 1, fontSize: 8, lineHeight: 1.5 }}>
                {ticket.title}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
