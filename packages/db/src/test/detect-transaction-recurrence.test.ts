import { describe, expect, test } from "bun:test";
import {
  detectTransactionRecurrence,
  type RecurrenceCandidate,
} from "../utils/detect-transaction-recurrence";
import { buildTransactionInsights } from "../utils/transaction-insights";

const payment = (
  date: string,
  changes: Partial<RecurrenceCandidate> = {},
): RecurrenceCandidate => ({
  id: crypto.randomUUID(),
  teamId: "team",
  bankAccountId: "account",
  name: "NETFLIX",
  merchantName: null,
  currency: "USD",
  amount: -20,
  date,
  recurring: false,
  recurrenceOverride: false,
  frequency: null,
  ...changes,
});
const monthly = () =>
  ["2026-01-31", "2026-02-28", "2026-03-31"].map((date) => payment(date));

describe("history-based recurrence detection", () => {
  test("handles statement punctuation, location codes and FX drift as one pattern", () => {
    const rows = [
      payment("2026-01-02", { name: "SERVICE* PLAN 11001", amount: -1000 }),
      payment("2026-02-03", { name: "Service Plan 11001", amount: -1080 }),
      payment("2026-03-02", { name: "SERVICE PLAN 05001", amount: -1120 }),
    ];
    const result = detectTransactionRecurrence(rows);
    expect(result.size).toBe(3);
    expect(new Set([...result.values()].map((row) => row.patternId)).size).toBe(
      1,
    );
    const report = buildTransactionInsights(
      rows.map((row) => ({
        ...row,
        recurring: true,
        frequency: "monthly",
        convertedAmount: row.amount,
        recurrencePatternId: result.get(row.id)!.patternId,
      })),
      {
        from: "2026-01-01",
        to: "2026-03-31",
        asOf: "2026-03-03",
        currency: "USD",
      },
    );
    expect(report.series).toHaveLength(1);
    expect(report.series[0]?.amount).toBe(1120);
    expect(
      detectTransactionRecurrence(rows, [
        { ...rows[0]!, recurring: false, frequency: null },
      ]).size,
    ).toBe(0);
  });

  test("accepts month-end payments posted just into the next month", () => {
    expect(
      detectTransactionRecurrence(
        ["2026-01-31", "2026-03-02", "2026-03-31"].map((date) => payment(date)),
      ).size,
    ).toBe(3);
  });

  test("discovers imported false defaults without any preexisting rule or recurring flag", () => {
    const rows = monthly();
    const result = detectTransactionRecurrence(rows);
    expect(result.size).toBe(3);
    for (const row of rows)
      expect(result.get(row.id)).toMatchObject({
        frequency: "monthly",
        observations: 3,
      });
  });

  test.each([
    ["weekly", ["2026-01-01", "2026-01-08", "2026-01-15"]],
    ["biweekly", ["2026-01-01", "2026-01-15", "2026-01-29"]],
    ["monthly", ["2026-01-02", "2026-02-02", "2026-03-02"]],
    ["annually", ["2024-02-29", "2025-02-28"]],
  ])("recognizes %s cadence", (frequency, dates) => {
    const result = detectTransactionRecurrence(
      dates.map((date) => payment(date)),
    );
    expect(
      [...result.values()].every((row) => row.frequency === frequency),
    ).toBe(true);
    expect(result.size).toBe(dates.length);
  });

  test("requires enough evidence and rejects irregular or daily shopping", () => {
    expect(detectTransactionRecurrence(monthly().slice(0, 2)).size).toBe(0);
    expect(
      detectTransactionRecurrence(
        ["2026-01-01", "2026-01-03", "2026-01-04"].map((date) => payment(date)),
      ).size,
    ).toBe(0);
    expect(
      detectTransactionRecurrence(
        ["2026-01-01", "2026-01-19", "2026-03-12"].map((date) => payment(date)),
      ).size,
    ).toBe(0);
  });

  test("allows one missing period but not unbounded gaps", () => {
    expect(
      detectTransactionRecurrence(
        ["2026-01-01", "2026-02-01", "2026-04-01"].map((date) => payment(date)),
      ).size,
    ).toBe(3);
    expect(
      detectTransactionRecurrence(
        ["2026-01-01", "2026-02-01", "2026-06-01"].map((date) => payment(date)),
      ).size,
    ).toBe(0);
  });

  test("uses normalized merchant identity after enrichment, even when bank descriptions differ", () => {
    const rows = monthly().map((row, index) => ({
      ...row,
      name: `CARD REF ${index}`,
      merchantName: " Netflix  ",
    }));
    expect(detectTransactionRecurrence(rows).size).toBe(3);
  });

  test.each([
    "teamId",
    "bankAccountId",
    "currency",
    "name",
  ] as const)("does not combine different %s values", (key) => {
    const rows = monthly();
    rows[2] = { ...rows[2]!, [key]: "different" };
    expect(detectTransactionRecurrence(rows).size).toBe(0);
  });

  test("separates refunds and substantially different amounts", () => {
    const rows = monthly();
    rows[2]!.amount = 20;
    expect(detectTransactionRecurrence(rows).size).toBe(0);
    rows[2]!.amount = -100;
    expect(detectTransactionRecurrence(rows).size).toBe(0);
    rows[2]!.amount = -20.5;
    expect(detectTransactionRecurrence(rows).size).toBe(3);
  });

  test("a duplicate same-day payment cannot manufacture evidence", () => {
    expect(
      detectTransactionRecurrence([
        payment("2026-01-01"),
        payment("2026-01-01"),
        payment("2026-02-01"),
      ]).size,
    ).toBe(0);
  });

  test("explicit opt-out rules suppress inferred matches; newest matching rule wins", () => {
    const rows = monthly();
    const optOut = { ...rows[0]!, recurring: false, frequency: null };
    expect(detectTransactionRecurrence(rows, [optOut]).size).toBe(0);
    expect(
      detectTransactionRecurrence(rows, [
        { ...optOut, recurring: true, frequency: "monthly" },
        optOut,
      ]).size,
    ).toBe(0);
  });

  test("never overwrites manually chosen recurrence or schedule", () => {
    const rows = monthly().map((row) => ({
      ...row,
      recurring: true,
      recurrenceOverride: true,
      frequency: "irregular",
    }));
    expect(detectTransactionRecurrence(rows).size).toBe(0);
  });

  test("is idempotent after persistence and fills unknown schedules only when not overridden", () => {
    const rows = monthly().map((row) => ({
      ...row,
      recurring: true,
      frequency: "monthly",
    }));
    expect(detectTransactionRecurrence(rows).size).toBe(0);
    rows.forEach((row) => {
      row.frequency = "unknown";
    });
    expect(detectTransactionRecurrence(rows).size).toBe(3);
  });

  test("unmarked history becomes visible and forecastable without saving or importing again", () => {
    const rows = monthly();
    const detected = detectTransactionRecurrence(rows);
    const report = buildTransactionInsights(
      rows.map((row) => ({
        ...row,
        convertedAmount: row.amount,
        recurring: detected.has(row.id),
        recordedRecurring: false,
        detected: detected.has(row.id),
        frequency: detected.get(row.id)?.frequency ?? null,
      })),
      {
        from: "2026-03-01",
        to: "2026-04-01",
        asOf: "2026-04-01",
        currency: "USD",
      },
    );
    expect(report.series).toHaveLength(1);
    expect(report.series[0]).toMatchObject({
      detected: true,
      frequency: "monthly",
      observations: 3,
      nextDate: "2026-04-30",
    });
    expect(report.forecast.expenses).toBe(20);
    expect(report.detectedCount).toBe(3);
    expect(report.actuals).toMatchObject({
      recurringExpenses: 0,
      otherExpenses: 20,
    });
  });
});
