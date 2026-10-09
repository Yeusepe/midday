"use client";

import { Button } from "@midday/ui/button";
import { Input } from "@midday/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@midday/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { FormatAmount } from "@/components/format-amount";
import { useTRPC } from "@/trpc/client";

const frequencies: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semi_monthly: "Twice monthly",
  monthly: "Monthly",
  annually: "Annually",
  irregular: "Irregular",
  unknown: "Unknown",
};
const dateLabel = (date: string) => format(parseISO(date), "MMM d, yyyy");

export function TransactionInsights({
  from,
  to,
  currency,
}: {
  from: string;
  to: string;
  currency?: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const analyze = useMutation(
    trpc.transactions.detectRecurring.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.reports.pathKey() }),
          queryClient.invalidateQueries({
            queryKey: trpc.transactions.pathKey(),
          }),
        ]);
      },
    }),
  );
  const { data, isPending, isError, refetch } = useQuery(
    trpc.reports.transactionInsights.queryOptions({ from, to, currency }),
  );
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [reviewOnly, setReviewOnly] = useState(false);

  if (isPending)
    return (
      <div className="border p-6 text-sm text-muted-foreground" role="status">
        Loading transaction insights…
      </div>
    );
  if (isError || !data)
    return (
      <div className="border p-6 space-y-3" role="alert">
        <p>Transaction insights could not be loaded.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );

  const money = (amount: number) => (
    <FormatAmount amount={amount} currency={data.currency} />
  );
  const actual = data.actuals;
  const totalExpenses = actual.recurringExpenses + actual.otherExpenses;
  const share = totalExpenses
    ? Math.round((actual.recurringExpenses / totalExpenses) * 100)
    : 0;
  const rows = data.series.filter(
    (item) =>
      (kind === "all" || item.type === kind) &&
      (!reviewOnly || item.status !== "expected" || item.amount === null) &&
      item.name.toLowerCase().includes(search.toLowerCase()),
  );
  const transactionLink = (
    recurring: "all" | "none",
    type: "income" | "expense",
  ) =>
    `/transactions?${new URLSearchParams({ start: from, end: to, recurring, type })}`;

  return (
    <section className="space-y-6" aria-labelledby="transaction-insights-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="transaction-insights-title" className="text-xl font-medium">
            Transaction insights
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Know what repeats, what to review, and what may come next.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={analyze.isPending}
            onClick={() => analyze.mutate()}
          >
            {analyze.isPending
              ? "Analyzing history…"
              : data.detectedCount > 0
                ? "Save detected recurrence"
                : "Recheck history"}
          </Button>
          <Button asChild variant="outline">
            <Link href="/transactions?recurring=all">
              Review recurring transactions
            </Link>
          </Button>
        </div>
      </div>

      {data.detectedCount > 0 && (
        <div className="border bg-muted/30 p-4 text-sm" role="status">
          Found {data.series.filter((item) => item.detected).length} recurring
          patterns across {data.detectedCount} transactions needing
          classification. They are shown below as “Detected” and included in
          upcoming estimates. Save detected recurrence to update transaction
          filters and all report charts.
        </div>
      )}
      {analyze.isError && (
        <p className="text-sm text-destructive" role="alert">
          Could not complete recurrence analysis. Try again.
        </p>
      )}
      {analyze.isSuccess && data.detectedCount === 0 && (
        <p className="text-sm text-muted-foreground" role="status">
          History analyzed. Recurring classifications and reports are up to
          date.
        </p>
      )}

      {(actual.missingConversions > 0 ||
        data.forecast.missingConversions > 0) && (
        <p
          className="border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
          role="status"
        >
          Some exchange rates are unavailable: {actual.missingConversions}{" "}
          transactions in this period and {data.forecast.missingConversions}{" "}
          recurring patterns are excluded from converted totals. Their original
          amounts remain visible below.
        </p>
      )}

      <div className="border bg-background p-5 space-y-5">
        <div>
          <h3 className="font-medium">Spending in the selected period</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {dateLabel(from)} – {dateLabel(to)} · {actual.count} transactions ·{" "}
            {data.currency}
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Marked recurring</p>
            <p className="text-2xl mt-2 tabular-nums">
              {money(actual.recurringExpenses)}
            </p>
            <Link
              className="text-xs underline underline-offset-4"
              href={transactionLink("all", "expense")}
            >
              Review recurring spending →
            </Link>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Not marked recurring
            </p>
            <p className="text-2xl mt-2 tabular-nums">
              {money(actual.otherExpenses)}
            </p>
            <Link
              className="text-xs underline underline-offset-4"
              href={transactionLink("none", "expense")}
            >
              Find one-offs or missed recurring payments →
            </Link>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Recurring share of spending
            </p>
            <p className="text-2xl mt-2 tabular-nums">{share}%</p>
            <div
              className="h-2 bg-muted mt-3 overflow-hidden rounded-full"
              role="meter"
              aria-label="Recurring share of spending"
              aria-valuenow={share}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-foreground"
                style={{ width: `${share}%` }}
              />
            </div>
          </div>
        </div>
        <div className="border-t pt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <Link
            className="underline underline-offset-4"
            href={transactionLink("all", "income")}
          >
            Recurring income: {money(actual.recurringIncome)}
          </Link>
          <Link
            className="underline underline-offset-4"
            href={transactionLink("none", "income")}
          >
            Other income: {money(actual.otherIncome)}
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Based on transaction markings. Unmarked payments may still recur.
          Income includes revenue categories only. Transfers and excluded
          transactions/categories are omitted from these totals.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border bg-background p-5 space-y-5">
          <div>
            <h3 className="font-medium">Next 30 days · recurring estimate</h3>
            <p className="text-xs text-muted-foreground mt-1">
              From {dateLabel(data.asOf)} · independent of the historical date
              filter
            </p>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <p className="text-sm text-muted-foreground">Expected outflow</p>
              <p className="text-2xl mt-1 tabular-nums">
                {money(data.forecast.expenses)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Expected inflow</p>
              <p className="text-2xl mt-1 tabular-nums">
                {money(data.forecast.income)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t pt-4 text-sm">
            <span>Net recurring cash flow</span>
            <span className="font-medium tabular-nums">
              {money(data.forecast.net)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Current recurring spending pace:{" "}
            <span className="text-foreground">
              {money(data.forecast.monthlyExpenses)}/month
            </span>
            . Annual and weekly payments are normalized for comparison.
          </p>
          <p className="text-xs text-muted-foreground">
            Estimates use marked and automatically detected patterns, repeating
            the latest amount and cadence. They exclude one-offs, invoices,
            overdue patterns, and schedules that need clarification. This is not
            a total cash-balance forecast.
          </p>
          {data.forecast.needsReview > 0 && (
            <Button
              variant="outline"
              className="whitespace-normal h-auto py-2"
              onClick={() => {
                setReviewOnly(true);
                setKind("all");
                setSearch("");
                document
                  .getElementById("recurring-patterns")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {data.forecast.needsReview} patterns need review before they can
              be projected →
            </Button>
          )}
        </div>
        <div className="border bg-background p-5">
          <h3 className="font-medium">Estimated upcoming payments</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Review a payment to confirm its amount and recurrence.
          </p>
          <div className="max-h-72 overflow-y-auto">
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6">
                No scheduled recurring payments can be estimated in the next 30
                days. Review the patterns below or mark recurring transactions.
              </p>
            ) : (
              <ul className="divide-y">
                {data.upcoming.map((item) => (
                  <li key={`${item.transactionId}-${item.date}`}>
                    <Link
                      href={`/transactions?transactionId=${item.transactionId}`}
                      className="flex items-center justify-between gap-3 py-3 hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {dateLabel(item.date)} ·{" "}
                          {item.type === "income" ? "Income" : "Expense"}
                        </p>
                      </div>
                      <span className="text-sm whitespace-nowrap tabular-nums">
                        {item.amount === null
                          ? "Rate unavailable"
                          : money(
                              item.type === "income"
                                ? item.amount
                                : -item.amount,
                            )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="border bg-background" id="recurring-patterns">
        <div className="p-5 space-y-4">
          <div>
            <h3 className="font-medium">
              Recurring payment patterns{" "}
              <span className="text-muted-foreground">
                ({data.series.length})
              </span>
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Marked and automatically detected patterns through{" "}
              {dateLabel(data.asOf)}, including payments outside the selected
              period. Patterns are grouped by account, merchant, currency,
              similar amount and cadence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-full sm:w-64"
              placeholder="Search recurring payments…"
              aria-label="Search recurring payments"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-40" aria-label="Payment type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="expense">Expenses</SelectItem>
                <SelectItem value="income">Income</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={reviewOnly ? "secondary" : "outline"}
              aria-pressed={reviewOnly}
              onClick={() => setReviewOnly(!reviewOnly)}
            >
              Needs review
            </Button>
          </div>
        </div>
        <div className="overflow-auto max-h-[540px]">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50">
              <tr>
                {[
                  "Payment",
                  "Latest amount",
                  "Frequency",
                  "Last seen",
                  "Next expected",
                  "Monthly equivalent",
                  "Action",
                ].map((title) => (
                  <th
                    key={title}
                    scope="col"
                    className="px-5 py-3 font-medium whitespace-nowrap"
                  >
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((item) => (
                <tr key={item.transactionId}>
                  <td className="px-5 py-4 min-w-48">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.type === "income" ? "Income" : "Expense"} ·{" "}
                      {item.observations} recorded
                    </p>
                    {item.detected && (
                      <span className="inline-block text-xs border px-2 py-0.5 mt-1">
                        Detected · review or save
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap tabular-nums">
                    {item.amount === null ? (
                      <FormatAmount
                        amount={item.originalAmount}
                        currency={item.originalCurrency}
                      />
                    ) : (
                      money(item.amount)
                    )}
                    {item.originalCurrency !== data.currency && (
                      <p className="text-xs text-muted-foreground">
                        {item.amount === null ? (
                          "Conversion unavailable"
                        ) : (
                          <FormatAmount
                            amount={item.originalAmount}
                            currency={item.originalCurrency}
                          />
                        )}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    {frequencies[item.frequency ?? "unknown"] ?? "Unknown"}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    {dateLabel(item.lastDate)}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    {item.nextDate
                      ? dateLabel(item.nextDate)
                      : "Schedule needed"}
                    <p className="text-xs text-muted-foreground">
                      {item.status === "overdue"
                        ? "Overdue · confirm still active"
                        : item.status === "needs_schedule"
                          ? "Not projected"
                          : "Estimated"}
                    </p>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap tabular-nums">
                    {item.monthlyEquivalent === null
                      ? "—"
                      : money(item.monthlyEquivalent)}
                  </td>
                  <td className="px-5 py-4">
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        aria-label={`Review ${item.name}`}
                        href={`/transactions?transactionId=${item.transactionId}`}
                      >
                        Review
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="p-8 text-sm text-muted-foreground">
              {data.series.length ? (
                "No recurring payments match these filters."
              ) : (
                <>
                  No recurring patterns found yet. Detection needs at least
                  three similarly sized payments on a weekly, biweekly, or
                  monthly schedule, or two annual payments.{" "}
                  <Link className="underline" href="/transactions">
                    Open Transactions
                  </Link>
                  , select a payment, and use “Mark as recurring” with its
                  frequency.
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
