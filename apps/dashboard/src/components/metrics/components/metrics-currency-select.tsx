"use client";

import { uniqueCurrencies } from "@midday/location/currencies";
import { ComboboxDropdown } from "@midday/ui/combobox-dropdown";
import { useMetricsFilter } from "@/hooks/use-metrics-filter";
import { useTeamQuery } from "@/hooks/use-team";

const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });
const currencyOptions = [...uniqueCurrencies].sort().map((currency) => ({
  id: currency,
  label: `${currency} — ${currencyNames.of(currency) ?? currency}`,
}));

export function MetricsCurrencySelect() {
  const { data: team } = useTeamQuery();
  const { currency, effectiveCurrency, updateCurrency } = useMetricsFilter();
  const items = [
    {
      id: "base",
      label: `Base currency${team?.baseCurrency ? ` (${team.baseCurrency})` : ""}`,
    },
    ...currencyOptions,
  ];

  return (
    <ComboboxDropdown
      items={items}
      selectedItem={items.find(
        (item) => item.id === (effectiveCurrency ?? "base"),
      )}
      onSelect={(item) => updateCurrency(item.id === "base" ? null : item.id)}
      placeholder="Report currency"
      searchPlaceholder="Search currencies"
      emptyResults="No currencies found"
      renderSelectedItem={() => (
        <span>
          <span className="sr-only">Report currency: </span>
          {currency ?? "Base currency"}
        </span>
      )}
      triggerClassName="w-auto min-w-24 gap-2"
      popoverProps={{ align: "end", className: "w-72 p-0" }}
    />
  );
}
