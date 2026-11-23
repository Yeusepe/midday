"use client";

import { formatWorkLogTime } from "@midday/invoice/work-log";
import { Button } from "@midday/ui/button";
import { Icons } from "@midday/ui/icons";
import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import type { InvoiceFormValues } from "./form-context";

export function LineItemDetails({ index }: { index: number }) {
  const { control } = useFormContext<InvoiceFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `lineItems.${index}.details`,
  });
  return (
    <section aria-label="Time entry details">
      {fields.length > 0 && (
        <>
          <div className="mb-3 mt-1 flex items-baseline justify-between gap-3 font-mono text-[11px]">
            <h3>Time entries</h3>
            <span className="text-muted-foreground">
              {fields.length} {fields.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <div
            className="hidden grid-cols-[112px_minmax(0,1fr)_72px_24px] gap-3 border-b border-border pb-2 font-mono text-[10px] text-muted-foreground sm:grid"
            aria-hidden="true"
          >
            <span>Date</span>
            <span>Work completed</span>
            <span className="text-right">Hours</span>
            <span />
          </div>
          <div className="mb-3 divide-y divide-border">
            {fields.map((detail, detailIndex) => (
              <DetailRow
                key={detail.id}
                index={index}
                detailIndex={detailIndex}
                onRemove={() => remove(detailIndex)}
              />
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() =>
          append({ date: "", title: "", description: "", hours: null })
        }
        className="flex items-center space-x-2 text-xs text-[#878787] font-mono"
      >
        <Icons.Add />
        <span className="text-[11px]">Add detail</span>
      </button>
    </section>
  );
}

function DetailRow({
  index,
  detailIndex,
  onRemove,
}: {
  index: number;
  detailIndex: number;
  onRemove: () => void;
}) {
  const { control, register, setValue } = useFormContext<InvoiceFormValues>();
  const name = `lineItems.${index}.details.${detailIndex}` as const;
  const detail = useWatch({ control, name });
  const tickets =
    useWatch({ control, name: `lineItems.${index}.tickets` }) ?? [];
  const [notesOpen, setNotesOpen] = useState(Boolean(detail?.description));
  const title = register(`${name}.title`);
  const identifiers =
    detail?.ticketIdentifiers?.filter((id) =>
      tickets.some((t) => t.identifier === id),
    ) ?? [];
  const fieldClass =
    "w-full min-w-0 bg-transparent border-0 border-b border-transparent px-0 py-1 text-[11px] font-mono leading-5 hover:border-border focus-visible:border-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_72px_24px] items-start gap-x-3 gap-y-2 py-3 sm:grid-cols-[112px_minmax(0,1fr)_72px_24px]">
      <input
        type="date"
        aria-label={`Entry ${detailIndex + 1} date`}
        {...register(`${name}.date`)}
        className={`${fieldClass} text-muted-foreground dark:[color-scheme:dark]`}
      />
      <div className="col-span-full row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <textarea
          rows={2}
          placeholder="Work completed"
          aria-label={`Entry ${detailIndex + 1} work completed`}
          {...title}
          ref={(element) => {
            title.ref(element);
            if (element) {
              element.style.height = "auto";
              element.style.height = `${element.scrollHeight}px`;
            }
          }}
          onInput={(event) => {
            const element = event.currentTarget;
            element.style.height = "auto";
            element.style.height = `${element.scrollHeight}px`;
          }}
          className={`${fieldClass} resize-none overflow-hidden`}
        />
        {identifiers.length > 0 && (
          <div
            aria-label="Tickets for this entry"
            className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-muted-foreground"
          >
            {identifiers.map((id) => (
              <span key={id} className="break-all">
                {id}
              </span>
            ))}
          </div>
        )}
        {notesOpen || detail?.description ? (
          <textarea
            rows={2}
            placeholder="Detailed notes"
            aria-label={`Entry ${detailIndex + 1} notes`}
            {...register(`${name}.description`)}
            className={`${fieldClass} mt-1 resize-y text-muted-foreground`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="mt-1 font-mono text-[10px] text-muted-foreground hover:text-primary"
          >
            Add note
          </button>
        )}
      </div>
      <div className="col-start-2 row-start-1 text-right sm:col-start-3">
        <input
          type="number"
          step="any"
          min="0"
          placeholder="Hours"
          aria-label={`Entry ${detailIndex + 1} hours`}
          {...register(`${name}.hours`, {
            setValueAs: (value) =>
              value === "" || value == null ? null : Number(value),
            onChange: () =>
              setValue(`${name}.duration`, null, { shouldDirty: true }),
          })}
          className={`${fieldClass} text-right tabular-nums`}
        />
        {detail?.duration != null && (
          <span className="block pt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
            {formatWorkLogTime(detail)}
          </span>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        aria-label={`Remove entry ${detailIndex + 1} detail`}
        className="col-start-3 row-start-1 size-6 p-0 text-muted-foreground hover:bg-transparent sm:col-start-4"
        onClick={onRemove}
      >
        <Icons.Close className="size-4" />
      </Button>
    </div>
  );
}
