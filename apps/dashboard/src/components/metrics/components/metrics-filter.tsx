"use client";

import { Button } from "@midday/ui/button";
import { Calendar, CalendarDayButton } from "@midday/ui/calendar";
import { cn } from "@midday/ui/cn";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@midday/ui/dropdown-menu";
import { Icons } from "@midday/ui/icons";
import { CheckIcon } from "@radix-ui/react-icons";
import { format, formatISO, parseISO } from "date-fns";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { useMetricsFilter } from "@/hooks/use-metrics-filter";
import { useUserQuery } from "@/hooks/use-user";
import type { PeriodOption } from "@/utils/metrics-date-utils";

const PERIOD_OPTIONS: Array<{ value: PeriodOption; label: string }> = [
  { value: "3-months", label: "3 months" },
  { value: "6-months", label: "6 months" },
  { value: "this-year", label: "This year" },
  { value: "1-year", label: "1 year" },
  { value: "2-years", label: "2 years" },
  { value: "5-years", label: "5 years" },
  { value: "fiscal-year", label: "Fiscal year" },
  { value: "custom", label: "Custom" },
];

const REVENUE_TYPE_OPTIONS: Array<{ value: "gross" | "net"; label: string }> = [
  { value: "gross", label: "Gross Revenue (inc tax)" },
  { value: "net", label: "Net Revenue (ex tax)" },
];

export function MetricsFilter() {
  const { data: user } = useUserQuery();
  const {
    period,
    revenueType,
    currency,
    from,
    to,
    updatePeriod,
    updateRevenueType,
    updateDateRange,
  } = useMetricsFilter();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Convert from/to strings to DateRange
  const dateRange: DateRange | undefined =
    from && to
      ? {
          from: parseISO(from),
          to: parseISO(to),
        }
      : undefined;

  const handleCustomDateSelect = (newDateRange?: DateRange) => {
    if (newDateRange?.from && newDateRange?.to) {
      updateDateRange(
        formatISO(newDateRange.from, { representation: "date" }),
        formatISO(newDateRange.to, { representation: "date" }),
      );
    }
  };

  const getButtonLabel = () => {
    // If custom period, show date range
    if (period === "custom" && dateRange?.from && dateRange?.to) {
      return `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d, yyyy")}`;
    }

    // Otherwise, show period label
    const option = PERIOD_OPTIONS.find((opt) => opt.value === period);
    return option?.label || "1 year";
  };

  return (
    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 px-2">
          <Icons.Filter size={16} className="text-[#666]" />
          <span className="hidden sm:inline">{getButtonLabel()}</span>
          <Icons.ChevronDown size={16} className="text-[#666]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end" sideOffset={10}>
        {/* PERIOD Section */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal px-2 py-1.5">
            PERIOD
          </DropdownMenuLabel>
          {PERIOD_OPTIONS.map((option) => {
            if (option.value === "custom") {
              const isCustomPeriod = String(period) === "custom";
              return (
                <DropdownMenuSub key={option.value}>
                  <DropdownMenuSubTrigger
                    className={cn(
                      "text-xs py-1.5 pl-4 pr-12 relative [&>svg]:hidden",
                      isCustomPeriod
                        ? "dark:bg-[#131313] dark:data-[state=open]:bg-[#131313] text-primary"
                        : "text-[#666]",
                      "hover:dark:bg-[#131313] hover:text-primary",
                    )}
                    onSelect={(e) => {
                      e.preventDefault();
                      if (!isCustomPeriod) {
                        updatePeriod(option.value);
                      }
                    }}
                  >
                    {option.label}
                    <span className="absolute right-2 flex items-center justify-center shrink-0">
                      {isCustomPeriod && (
                        <CheckIcon className="h-4 w-4 shrink-0" />
                      )}
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-auto p-0" sideOffset={8}>
                    <Calendar
                      mode="range"
                      weekStartsOn={user?.weekStartsOnMonday ? 1 : 0}
                      selected={dateRange}
                      onSelect={handleCustomDateSelect}
                      disabled={(date) => date > new Date()}
                      defaultMonth={dateRange?.from}
                      numberOfMonths={2}
                      classNames={{
                        range_start: "bg-accent rounded-none",
                        range_end: "bg-accent rounded-none",
                        range_middle: "rounded-none",
                        today: "bg-transparent rounded-none",
                      }}
                      components={{
                        DayButton: ({
                          className,
                          day,
                          modifiers,
                          ...props
                        }) => (
                          <CalendarDayButton
                            day={day}
                            modifiers={modifiers}
                            {...props}
                            className={cn(
                              className,
                              "data-[selected-single=true]:!rounded-none",
                              "data-[range-start=true]:!rounded-none",
                              "data-[range-end=true]:!rounded-none",
                              "data-[range-middle=true]:!rounded-none",
                              "[&:hover]:!rounded-none",
                            )}
                          />
                        ),
                      }}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            }

            return (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={period === option.value}
                onCheckedChange={() => updatePeriod(option.value)}
                className={cn(
                  "text-xs",
                  period === option.value
                    ? "dark:bg-[#131313] text-primary"
                    : "text-[#666]",
                  "hover:dark:bg-[#131313]",
                )}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* REVENUE TYPE Section */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal px-2 py-1.5">
            REVENUE TYPE
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={revenueType}
            onValueChange={(value) =>
              updateRevenueType(value as "gross" | "net")
            }
          >
            {REVENUE_TYPE_OPTIONS.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                className={cn(
                  "text-xs",
                  revenueType === option.value &&
                    "dark:bg-[#131313] dark:data-[state=checked]:bg-[#131313]",
                  "hover:dark:bg-[#131313]",
                )}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Info Text */}
        <div className="px-2 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Amounts are shown in {currency ?? "your base currency"} using stored
            conversions or available exchange rates. Amounts without a
            conversion are excluded. Metrics depend on how transactions are
            categorized.
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
