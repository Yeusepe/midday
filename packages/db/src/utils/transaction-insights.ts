import { matchesRecurrenceRule } from "./transaction-recurrence";

export type InsightTransaction = {
  id: string;
  teamId: string;
  name: string;
  merchantName: string | null;
  bankAccountId: string | null;
  amount: number;
  currency: string;
  convertedAmount: number | null;
  date: string;
  recurring: boolean | null;
  detected?: boolean;
  recordedRecurring?: boolean;
  recurrencePatternId?: string;
  frequency: string | null;
};

const DAY = 86_400_000;
const round = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Advance from the original anchor to avoid drifting after February/month end. */
function occurrence(anchor: string, frequency: string | null, step: number) {
  const date = new Date(`${anchor}T00:00:00Z`);
  if (frequency === "weekly" || frequency === "biweekly") {
    return new Date(+date + step * (frequency === "weekly" ? 7 : 14) * DAY);
  }
  if (frequency === "monthly" || frequency === "annually") {
    const month =
      date.getUTCMonth() + step * (frequency === "monthly" ? 1 : 12);
    const last = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0));
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        month,
        Math.min(date.getUTCDate(), last.getUTCDate()),
      ),
    );
  }
  return null;
}

/** Actuals use the selected period; upcoming estimates always use today's date. */
export function buildTransactionInsights(
  rows: InsightTransaction[],
  params: { from: string; to: string; asOf: string; currency: string },
) {
  const { from, to, asOf, currency } = params;
  const horizon = iso(new Date(+new Date(`${asOf}T00:00:00Z`) + 30 * DAY));
  const actuals = {
    recurringExpenses: 0,
    otherExpenses: 0,
    recurringIncome: 0,
    otherIncome: 0,
    count: 0,
    missingConversions: 0,
  };
  const groups: InsightTransaction[][] = [];
  // Newest first, so a series' review link and estimate use its latest payment.
  for (const row of [...rows].sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  )) {
    if (row.date > asOf) continue;
    const markedRecurring = row.recordedRecurring ?? row.recurring;
    if (row.date >= from && row.date <= to) {
      actuals.count++;
      if (row.convertedAmount === null) actuals.missingConversions++;
      else if (row.convertedAmount < 0) {
        actuals[markedRecurring ? "recurringExpenses" : "otherExpenses"] +=
          Math.abs(row.convertedAmount);
      } else {
        actuals[markedRecurring ? "recurringIncome" : "otherIncome"] +=
          row.convertedAmount;
      }
    }
    if (!row.recurring || row.amount === 0) continue;
    const group = groups.find((candidate) => {
      const latest = candidate[0];
      if (latest?.recurrencePatternId && row.recurrencePatternId) {
        return latest.recurrencePatternId === row.recurrencePatternId;
      }
      return (
        latest &&
        !candidate.some((payment) => payment.date === row.date) &&
        latest.bankAccountId === row.bankAccountId &&
        latest.frequency === row.frequency &&
        matchesRecurrenceRule(row, {
          ...latest,
          recurring: true,
          frequency:
            latest.frequency === "unknown" ||
            latest.frequency === "semi_monthly" ||
            !latest.frequency
              ? "irregular"
              : latest.frequency,
        })
      );
    });
    if (group) group.push(row);
    else groups.push([row]);
  }

  const upcoming: {
    transactionId: string;
    name: string;
    date: string;
    amount: number | null;
    type: "income" | "expense";
  }[] = [];
  const series = groups
    .map((group) => {
      const latest = group[0]!;
      // Only recover a clipped calendar anchor at month end. Weekly estimates
      // must advance from the latest payment, even if earlier payments drifted.
      const latestDate = new Date(`${latest.date}T00:00:00Z`);
      const lastDay = new Date(
        Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth() + 1, 0),
      ).getUTCDate();
      const clippedCalendarDate =
        ["monthly", "annually"].includes(latest.frequency ?? "") &&
        latestDate.getUTCDate() === lastDay;
      const anchor = clippedCalendarDate
        ? [...group].sort(
            (a, b) => Number(b.date.slice(8)) - Number(a.date.slice(8)),
          )[0]!
        : latest;
      let step = 1;
      let next = occurrence(anchor.date, latest.frequency, step);
      while (next && iso(next) <= latest.date)
        next = occurrence(anchor.date, latest.frequency, ++step);
      const nextDate = next ? iso(next) : null;
      const status = !nextDate
        ? ("needs_schedule" as const)
        : nextDate < asOf
          ? ("overdue" as const)
          : ("expected" as const);
      const amount =
        latest.convertedAmount === null
          ? null
          : Math.abs(latest.convertedAmount);
      const type =
        latest.amount < 0 ? ("expense" as const) : ("income" as const);
      let projectedAmount = 0;
      // Never silently roll stale payments forward; ask the user to review them.
      while (next && status === "expected" && iso(next) < horizon) {
        upcoming.push({
          transactionId: latest.id,
          name: latest.merchantName || latest.name,
          date: iso(next),
          amount,
          type,
        });
        projectedAmount += amount ?? 0;
        next = occurrence(anchor.date, latest.frequency, ++step);
      }
      const factor = {
        weekly: 52 / 12,
        biweekly: 26 / 12,
        monthly: 1,
        annually: 1 / 12,
      }[latest.frequency ?? ""];
      return {
        transactionId: latest.id,
        name: latest.merchantName || latest.name,
        frequency: latest.frequency,
        type,
        amount,
        originalAmount: Math.abs(latest.amount),
        originalCurrency: latest.currency,
        lastDate: latest.date,
        nextDate,
        status,
        observations: group.length,
        detected: group.some((row) => row.detected),
        monthlyEquivalent:
          amount !== null && factor !== undefined && status === "expected"
            ? round(amount * factor)
            : null,
        projectedAmount: round(projectedAmount),
      };
    })
    .sort(
      (a, b) =>
        (b.monthlyEquivalent ?? 0) - (a.monthlyEquivalent ?? 0) ||
        a.name.localeCompare(b.name),
    );

  const projectedIncome = upcoming
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const projectedExpenses = upcoming
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);
  return {
    currency,
    from,
    to,
    asOf,
    horizon,
    actuals: {
      ...actuals,
      recurringExpenses: round(actuals.recurringExpenses),
      otherExpenses: round(actuals.otherExpenses),
      recurringIncome: round(actuals.recurringIncome),
      otherIncome: round(actuals.otherIncome),
    },
    forecast: {
      income: round(projectedIncome),
      expenses: round(projectedExpenses),
      net: round(projectedIncome - projectedExpenses),
      monthlyExpenses: round(
        series
          .filter((item) => item.type === "expense")
          .reduce((sum, item) => sum + (item.monthlyEquivalent ?? 0), 0),
      ),
      needsReview: series.filter((item) => item.status !== "expected").length,
      missingConversions: series.filter((item) => item.amount === null).length,
    },
    series,
    detectedCount: rows.filter((row) => row.detected).length,
    upcoming: upcoming.sort((a, b) => a.date.localeCompare(b.date)),
  };
}
