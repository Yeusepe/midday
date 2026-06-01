import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { DEFAULT_TEMPLATE_SETTINGS } from "../../../defaults";
import type { Template } from "../../../types";

type Props = {
  template: Template;
  invoiceNumber?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
};

export function Meta({ template, invoiceNumber, issueDate, dueDate }: Props) {
  if (!template) {
    return null;
  }

  const dateFormat =
    template.dateFormat || DEFAULT_TEMPLATE_SETTINGS.dateFormat;

  return (
    <div tw="flex justify-between items-center mt-14 mb-2">
      <div tw="flex items-center">
        <span
          tw="text-[22px] text-[#878787] mr-2"
          style={{ fontFamily: "airbnb-cereal" }}
        >
          {template.invoiceNoLabel}:
        </span>
        <span
          tw="text-[22px] text-white"
          style={{ fontFamily: "airbnb-cereal" }}
        >
          {invoiceNumber}
        </span>
      </div>

      <div tw="flex items-center">
        <span
          tw="text-[22px] text-[#878787] mr-2"
          style={{ fontFamily: "airbnb-cereal" }}
        >
          {template.issueDateLabel}:
        </span>
        <span
          tw="text-[22px] text-white"
          style={{ fontFamily: "airbnb-cereal" }}
        >
          {issueDate ? format(new TZDate(issueDate, "UTC"), dateFormat) : ""}
        </span>
      </div>

      <div tw="flex items-center">
        <span
          tw="text-[22px] text-[#878787] mr-2"
          style={{ fontFamily: "airbnb-cereal" }}
        >
          {template.dueDateLabel}:
        </span>
        <span
          tw="text-[22px] text-white"
          style={{ fontFamily: "airbnb-cereal" }}
        >
          {dueDate ? format(new TZDate(dueDate, "UTC"), dateFormat) : ""}
        </span>
      </div>
    </div>
  );
}
