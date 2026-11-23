"use client";

import { replaceWorkLogTicketIdentifier } from "@midday/invoice/work-log";
import { Button } from "@midday/ui/button";
import { Icons } from "@midday/ui/icons";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import type { InvoiceFormValues } from "./form-context";

export function LineItemTickets({ index }: { index: number }) {
  const { control, register, getValues, setValue } =
    useFormContext<InvoiceFormValues>();
  const { fields, remove } = useFieldArray({
    control,
    name: `lineItems.${index}.tickets`,
  });
  const tickets = useWatch({ control, name: `lineItems.${index}.tickets` });
  if (!fields.length) return null;

  return (
    <section className="mt-4 border-t border-border pt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
        <h3 className="text-[11px] font-mono text-muted-foreground">
          Ticket reference
        </h3>
        <span className="text-[11px] text-muted-foreground">
          Visible on this invoice
        </span>
      </div>
      <div className="divide-y divide-border">
        {fields.map((ticket, ticketIndex) => (
          <div
            key={ticket.id}
            className="grid grid-cols-[80px_minmax(0,1fr)_28px] items-start gap-3 py-2"
          >
            <input
              aria-label={`Ticket ${ticketIndex + 1} ID`}
              {...register(
                `lineItems.${index}.tickets.${ticketIndex}.identifier`,
              )}
              onChange={(event) => {
                const name =
                  `lineItems.${index}.tickets.${ticketIndex}.identifier` as const;
                const previous = getValues(name) ?? ticket.identifier;
                const next = event.target.value;
                setValue(name, next, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setValue(
                  `lineItems.${index}.details`,
                  replaceWorkLogTicketIdentifier(
                    getValues(`lineItems.${index}.details`),
                    previous,
                    next,
                  ),
                  { shouldDirty: true },
                );
              }}
              maxLength={100}
              className="w-full bg-transparent py-1 text-[11px] font-mono text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <textarea
              aria-label={`Ticket ${ticketIndex + 1} title`}
              {...register(`lineItems.${index}.tickets.${ticketIndex}.title`)}
              rows={2}
              maxLength={1000}
              className="w-full resize-y bg-transparent py-1 text-[11px] font-mono leading-5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-label={`Remove ${tickets?.[ticketIndex]?.identifier ?? ticket.identifier} from invoice`}
              onClick={() => {
                const identifier =
                  getValues(
                    `lineItems.${index}.tickets.${ticketIndex}.identifier`,
                  ) ?? ticket.identifier;
                setValue(
                  `lineItems.${index}.details`,
                  replaceWorkLogTicketIdentifier(
                    getValues(`lineItems.${index}.details`),
                    identifier,
                    null,
                  ),
                  { shouldDirty: true },
                );
                remove(ticketIndex);
              }}
            >
              <Icons.Close className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
