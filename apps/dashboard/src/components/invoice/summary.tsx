import {
  calculateConvertedAmount,
  calculateTotal,
} from "@midday/invoice/calculate";
import { uniqueCurrencies } from "@midday/location/currencies";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTemplateUpdate } from "@/hooks/use-template-update";
import { useTRPC } from "@/trpc/client";
import { AnimatedNumber } from "../animated-number";
import { FormatAmount } from "../format-amount";
import { SelectCurrency } from "../select-currency";
import { AmountInput } from "./amount-input";
import { LabelInput } from "./label-input";
import { TaxInput } from "./tax-input";
import { VATInput } from "./vat-input";

export function Summary() {
  const { control, setValue } = useFormContext();
  const { updateTemplate } = useTemplateUpdate();
  const trpc = useTRPC();
  const previousCurrencyRef = useRef<string | undefined>(undefined);

  const includeDecimals = useWatch({
    control,
    name: "template.includeDecimals",
  });

  const maximumFractionDigits = includeDecimals ? 2 : 0;

  const currency = useWatch({
    control,
    name: "template.currency",
  });

  const locale = useWatch({
    control,
    name: "template.locale",
  });

  const includeTax = useWatch({
    control,
    name: "template.includeTax",
  });

  const taxRate = useWatch({
    control,
    name: "template.taxRate",
  });

  const vatRate = useWatch({
    control,
    name: "template.vatRate",
  });

  const includeVat = useWatch({
    control,
    name: "template.includeVat",
  });

  const includeDiscount = useWatch({
    control,
    name: "template.includeDiscount",
  });

  const includeLineItemTax = useWatch({
    control,
    name: "template.includeLineItemTax",
  });

  const lineItems = useWatch({
    control,
    name: "lineItems",
  });

  const discount = useWatch({
    control,
    name: "discount",
  });

  const convertedCurrency = useWatch({
    control,
    name: "convertedCurrency",
  });

  const exchangeRate = useWatch({
    control,
    name: "exchangeRate",
  });

  const exchangeRateSource = useWatch({
    control,
    name: "exchangeRateSource",
  });

  const {
    subTotal,
    total,
    vat: totalVAT,
    tax: totalTax,
  } = calculateTotal({
    lineItems,
    taxRate,
    vatRate,
    includeVat,
    includeTax,
    includeLineItemTax,
    discount: discount ?? 0,
  });

  const hasConvertedCurrency =
    convertedCurrency && convertedCurrency !== currency;

  const shouldFetchRate =
    Boolean(currency && hasConvertedCurrency) && !exchangeRate;

  const exchangeRateQuery = useQuery(
    trpc.invoice.exchangeRate.queryOptions(
      {
        base: currency,
        target: convertedCurrency ?? currency,
      },
      {
        enabled: shouldFetchRate,
        staleTime: Number.POSITIVE_INFINITY,
      },
    ),
  );

  const convertedAmount =
    hasConvertedCurrency && exchangeRate
      ? calculateConvertedAmount({ amount: total, exchangeRate })
      : null;

  const updateFormValues = useCallback(() => {
    setValue("amount", total, { shouldValidate: true });
    setValue("vat", totalVAT, { shouldValidate: true });
    setValue("tax", totalTax, { shouldValidate: true });
    setValue("subtotal", subTotal, { shouldValidate: true });
    setValue("discount", discount ?? 0, { shouldValidate: true });
    setValue("convertedAmount", convertedAmount, { shouldValidate: true });
  }, [total, totalVAT, totalTax, subTotal, discount, convertedAmount]);

  useEffect(() => {
    updateFormValues();
  }, [updateFormValues]);

  useEffect(() => {
    if (!includeTax) {
      setValue("template.taxRate", 0, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }, [includeTax]);

  useEffect(() => {
    if (!includeVat) {
      setValue("template.vatRate", 0, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }, [includeVat]);

  useEffect(() => {
    if (!includeDiscount) {
      setValue("discount", 0, { shouldValidate: true, shouldDirty: true });
    }
  }, [includeDiscount]);

  useEffect(() => {
    if (previousCurrencyRef.current === undefined) {
      previousCurrencyRef.current = currency;
      return;
    }

    if (previousCurrencyRef.current !== currency && convertedCurrency) {
      setValue("exchangeRate", null, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue("exchangeRateSource", null, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue("exchangeRateUpdatedAt", null, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue("convertedAmount", null, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }

    previousCurrencyRef.current = currency;
  }, [currency, convertedCurrency, setValue]);

  useEffect(() => {
    if (convertedCurrency && convertedCurrency === currency) {
      setValue("convertedCurrency", null, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue("exchangeRate", null, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue("exchangeRateSource", null, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue("exchangeRateUpdatedAt", null, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue("convertedAmount", null, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }, [convertedCurrency, currency, setValue]);

  useEffect(() => {
    if (!exchangeRateQuery.data || exchangeRate || !hasConvertedCurrency) {
      return;
    }

    setValue("exchangeRate", exchangeRateQuery.data.rate, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setValue("exchangeRateSource", "automatic", {
      shouldValidate: true,
      shouldDirty: true,
    });
    setValue("exchangeRateUpdatedAt", exchangeRateQuery.data.updatedAt, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }, [exchangeRateQuery.data, exchangeRate, hasConvertedCurrency, setValue]);

  return (
    <div className="w-[320px] flex flex-col">
      <div className="flex justify-between items-center py-1">
        <LabelInput
          className="flex-shrink-0 min-w-6"
          name="template.subtotalLabel"
          onSave={(value) => {
            updateTemplate({ subtotalLabel: value });
          }}
        />
        <span className="text-right text-[11px] text-[#878787]">
          <FormatAmount
            amount={subTotal}
            maximumFractionDigits={maximumFractionDigits}
            currency={currency}
            locale={locale}
          />
        </span>
      </div>

      {includeDiscount && (
        <div className="flex justify-between items-center py-1">
          <LabelInput
            name="template.discountLabel"
            onSave={(value) => {
              updateTemplate({ discountLabel: value });
            }}
          />

          <AmountInput
            placeholder="0"
            allowNegative={false}
            name="discount"
            className="text-right text-[11px] text-[#878787] border-none"
          />
        </div>
      )}

      {includeVat && (
        <div className="flex justify-between items-center py-1">
          <div className="flex items-center gap-1">
            <LabelInput
              className="flex-shrink-0 min-w-5"
              name="template.vatLabel"
              onSave={(value) => {
                updateTemplate({ vatLabel: value });
              }}
            />

            <VATInput />
          </div>

          <span className="text-right text-[11px] text-[#878787]">
            <FormatAmount
              amount={totalVAT}
              maximumFractionDigits={2}
              currency={currency}
              locale={locale}
            />
          </span>
        </div>
      )}

      {includeTax && !includeLineItemTax && (
        <div className="flex justify-between items-center py-1">
          <div className="flex items-center gap-1">
            <LabelInput
              className="flex-shrink-0 min-w-5"
              name="template.taxLabel"
              onSave={(value) => {
                updateTemplate({ taxLabel: value });
              }}
            />

            <TaxInput />
          </div>

          <span className="text-right text-[11px] text-[#878787]">
            <FormatAmount
              amount={totalTax}
              maximumFractionDigits={2}
              currency={currency}
              locale={locale}
            />
          </span>
        </div>
      )}

      {includeLineItemTax && totalTax > 0 && (
        <div className="flex justify-between items-center py-1">
          <LabelInput
            className="flex-shrink-0 min-w-5"
            name="template.taxLabel"
            onSave={(value) => {
              updateTemplate({ taxLabel: value });
            }}
          />

          <span className="text-right text-[11px] text-[#878787]">
            <FormatAmount
              amount={totalTax}
              maximumFractionDigits={2}
              currency={currency}
              locale={locale}
            />
          </span>
        </div>
      )}

      <div className="flex justify-between items-center py-4 mt-2 border-t border-border">
        <LabelInput
          name="template.totalSummaryLabel"
          onSave={(value) => {
            updateTemplate({ totalSummaryLabel: value });
          }}
        />
        <span className="text-right font-medium text-[21px]">
          <AnimatedNumber
            value={total}
            currency={currency}
            maximumFractionDigits={
              includeTax || includeVat || includeLineItemTax
                ? 2
                : maximumFractionDigits
            }
          />
        </span>
      </div>

      <div className="border-t border-border pt-3 space-y-2">
        <div className="flex justify-between items-center gap-4 py-1">
          <span className="text-[11px] text-[#878787] font-mono">
            Display currency
          </span>
          <SelectCurrency
            currencies={uniqueCurrencies}
            value={convertedCurrency ?? undefined}
            onChange={(value) => {
              setValue("convertedCurrency", value, {
                shouldValidate: true,
                shouldDirty: true,
              });
              setValue("exchangeRate", null, {
                shouldValidate: true,
                shouldDirty: true,
              });
              setValue("exchangeRateSource", null, {
                shouldValidate: true,
                shouldDirty: true,
              });
              setValue("exchangeRateUpdatedAt", null, {
                shouldValidate: true,
                shouldDirty: true,
              });
              setValue("convertedAmount", null, {
                shouldValidate: true,
                shouldDirty: true,
              });
            }}
            triggerClassName="h-7 w-[96px] text-[11px]"
          />
        </div>

        {hasConvertedCurrency && (
          <>
            <div className="flex justify-between items-center gap-4 py-1">
              <span className="text-[11px] text-[#878787] font-mono">Rate</span>
              <div className="flex items-center gap-1 text-[11px] text-[#878787]">
                <span>1 {currency} =</span>
                <AmountInput
                  name="exchangeRate"
                  placeholder="0"
                  decimalScale={8}
                  className="w-20 text-right text-[11px] text-[#878787] border-none"
                  onBlur={() => {
                    setValue("exchangeRateSource", "manual", {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                    setValue(
                      "exchangeRateUpdatedAt",
                      new Date().toISOString(),
                      {
                        shouldValidate: true,
                        shouldDirty: true,
                      },
                    );
                  }}
                />
                <span>{convertedCurrency}</span>
              </div>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-[11px] text-[#878787] font-mono">
                Converted total
              </span>
              <span className="text-right text-[13px] font-medium">
                {convertedAmount != null ? (
                  <FormatAmount
                    amount={convertedAmount}
                    maximumFractionDigits={2}
                    currency={convertedCurrency}
                    locale={locale}
                  />
                ) : (
                  <span className="text-[#878787]">-</span>
                )}
              </span>
            </div>

            {exchangeRateSource && (
              <div className="text-right text-[10px] text-[#878787]">
                {exchangeRateSource === "automatic" ? "Automatic" : "Manual"}{" "}
                rate
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
