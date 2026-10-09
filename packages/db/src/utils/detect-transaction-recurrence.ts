import {
  matchesRecurrenceRule,
  type RecurrencePayment,
  type RecurrenceRule,
} from "./transaction-recurrence";

export type RecurrenceCandidate = RecurrencePayment & {
  id: string;
  bankAccountId: string | null;
  recurring: boolean | null;
  recurrenceOverride: boolean;
  frequency: string | null;
};
export type DetectedFrequency = "weekly" | "biweekly" | "monthly" | "annually";
export type DetectedRecurrence = {
  frequency: DetectedFrequency;
  observations: number;
  patternId: string;
  needsUpdate: boolean;
};

const DAY = 86_400_000;
/** Normalize bank punctuation and trailing location codes when grouping history. */
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+\d{5}$/, "")
    .replace(/\s+/g, " ");

/** Honor opt-outs across the same spelling and FX variations accepted by detection. */
function matchesDetectionRule(row: RecurrenceCandidate, rule: RecurrenceRule) {
  if (matchesRecurrenceRule(row, rule)) return true;
  // Opt-outs also suppress statement spelling and FX variations accepted here.
  return (
    !rule.recurring &&
    row.teamId === rule.teamId &&
    row.currency.toUpperCase() === rule.currency.toUpperCase() &&
    Math.sign(row.amount) === Math.sign(rule.amount) &&
    normalize(row.merchantName || row.name) ===
      normalize(rule.merchantName || rule.name) &&
    Math.abs(row.amount - rule.amount) <=
      Math.max(0.01, Math.abs(rule.amount) * 0.15)
  );
}

/** Validate a dated series against calendar anchors, posting delays, and bounded gaps. */
function cadence(rows: RecurrenceCandidate[], frequency: DetectedFrequency) {
  if (rows.length < (frequency === "annually" ? 2 : 3)) return false;
  const anchor = new Date(`${rows[0]!.date}T00:00:00Z`);
  let previousStep = 0;
  let adjacent = false;
  for (const row of rows.slice(1)) {
    const date = new Date(`${row.date}T00:00:00Z`);
    let step: number;
    let error: number;
    if (frequency === "weekly" || frequency === "biweekly") {
      const period = frequency === "weekly" ? 7 : 14;
      const days = (+date - +anchor) / DAY;
      step = Math.round(days / period);
      error = Math.abs(days - step * period);
      if (error > 1) return false;
    } else {
      const months =
        (date.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
        date.getUTCMonth() -
        anchor.getUTCMonth();
      const approximateStep =
        frequency === "annually" ? Math.round(months / 12) : months;
      // Calendar anchors tolerate month ends, leap years, and posting delays.
      step = approximateStep;
      error = Number.POSITIVE_INFINITY;
      for (const candidate of [
        approximateStep - 1,
        approximateStep,
        approximateStep + 1,
      ]) {
        const month =
          anchor.getUTCMonth() +
          candidate * (frequency === "annually" ? 12 : 1);
        const lastDay = new Date(
          Date.UTC(anchor.getUTCFullYear(), month + 1, 0),
        ).getUTCDate();
        const expected = Date.UTC(
          anchor.getUTCFullYear(),
          month,
          Math.min(anchor.getUTCDate(), lastDay),
        );
        const distance = Math.abs(+date - expected) / DAY;
        if (distance < error) {
          error = distance;
          step = candidate;
        }
      }
      if (error > 3) return false;
    }
    const gap = step - previousStep;
    if (gap < 1 || gap > (frequency === "monthly" ? 3 : 2)) return false;
    if (gap === 1) adjacent = true;
    previousStep = step;
  }
  // Do not call monthly payments weekly merely because four weeks elapsed.
  return adjacent;
}

/** Infer cadence from actual history, without requiring an existing recurring flag.
 * Rules must be newest first; explicit opt-outs and schedules always win.
 * Normalize statement punctuation/location codes and allow a bounded 15% amount
 * band for FX variation; a consistent cadence is still required.
 */
export function detectTransactionRecurrence(
  rows: RecurrenceCandidate[],
  rules: RecurrenceRule[] = [],
  options: { includeClassified?: boolean } = {},
): Map<string, DetectedRecurrence> {
  const result = new Map<string, DetectedRecurrence>();
  const buckets = new Map<string, RecurrenceCandidate[]>();
  for (const row of rows) {
    if (
      !Number.isFinite(row.amount) ||
      row.amount === 0 ||
      !Number.isFinite(Date.parse(row.date))
    )
      continue;
    if (row.recurrenceOverride && !row.recurring) continue;
    const rule = rules.find((item) => matchesDetectionRule(row, item));
    if (rule && !rule.recurring) continue;
    const name = normalize(row.merchantName?.trim() || row.name);
    if (!name) continue;
    const key = JSON.stringify([
      row.teamId,
      row.bankAccountId,
      name,
      row.currency.toUpperCase(),
      Math.sign(row.amount),
    ]);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    const amountGroups: RecurrenceCandidate[][] = [];
    for (const row of bucket.sort((a, b) => a.amount - b.amount)) {
      const group = amountGroups.find(
        (items) =>
          Math.abs(items[0]!.amount - row.amount) <=
          Math.max(0.01, Math.abs(items[0]!.amount) * 0.15),
      );
      if (group) group.push(row);
      else amountGroups.push([row]);
    }
    for (const group of amountGroups) {
      const dated = group.sort((a, b) => a.date.localeCompare(b.date));
      // Multiple indistinguishable payments on one day do not prove a cadence.
      if (new Set(dated.map((row) => row.date)).size !== dated.length) continue;
      // Prefer a calendar month to a coincidentally similar 28-day interval.
      const frequency = (
        ["monthly", "weekly", "biweekly", "annually"] as const
      ).find((value) => cadence(dated, value));
      if (!frequency) continue;
      for (const row of dated) {
        if (
          row.recurrenceOverride ||
          rules.some((rule) => matchesDetectionRule(row, rule))
        )
          continue;
        const classified = Boolean(
          row.recurring && row.frequency && row.frequency !== "unknown",
        );
        if (
          classified &&
          (!options.includeClassified || row.frequency !== frequency)
        )
          continue;
        result.set(row.id, {
          frequency,
          observations: dated.length,
          patternId: dated[0]!.id,
          needsUpdate: !classified,
        });
      }
    }
  }
  return result;
}
