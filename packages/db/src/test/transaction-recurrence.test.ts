import { describe, expect, test } from "bun:test";
import {
  matchesRecurrenceRule,
  type RecurrencePayment,
  type RecurrenceRule,
} from "../utils/transaction-recurrence";

const rule: RecurrenceRule = {
  teamId: "a",
  name: "MSFT 123",
  merchantName: "Microsoft",
  amount: -20,
  currency: "USD",
  date: "2024-01-31",
  recurring: true,
  frequency: "monthly",
};
const payment: RecurrencePayment = {
  ...rule,
  name: "MICROSOFT 456",
  date: "2024-02-29",
};

describe("confirmed recurrence rules", () => {
  test("matches normalized merchants, month ends, and modest price changes", () => {
    expect(
      matchesRecurrenceRule(
        { ...payment, merchantName: " MICROSOFT ", amount: -20.5 },
        rule,
      ),
    ).toBe(true);
    expect(
      matchesRecurrenceRule({ ...payment, date: "2025-02-28" }, rule),
    ).toBe(true);
    expect(
      matchesRecurrenceRule({ ...payment, date: "2024-03-02" }, rule),
    ).toBe(true);
  });
  test.each([
    { teamId: "other" },
    { currency: "EUR" },
    { amount: 20 },
    { amount: -40 },
    { merchantName: "Microsoft Store" },
    { date: "2024-02-15" },
    { amount: Number.NaN },
    { date: "bad" },
  ])("rejects mismatched context %j", (change) => {
    expect(matchesRecurrenceRule({ ...payment, ...change }, rule)).toBe(false);
  });
  test("raw identity works before enrichment without fuzzy vendor guesses", () => {
    expect(
      matchesRecurrenceRule(
        { ...payment, name: "msft 123", merchantName: null },
        rule,
      ),
    ).toBe(true);
    expect(
      matchesRecurrenceRule({ ...payment, merchantName: null }, rule),
    ).toBe(false);
    expect(
      matchesRecurrenceRule(
        { ...payment, name: "", merchantName: null },
        { ...rule, name: "", merchantName: null },
      ),
    ).toBe(false);
  });
  test("supports skipped weekly occurrences and annual leap days", () => {
    expect(
      matchesRecurrenceRule(
        { ...payment, date: "2024-02-14" },
        { ...rule, frequency: "weekly" },
      ),
    ).toBe(true);
    expect(
      matchesRecurrenceRule(
        { ...payment, date: "2024-02-17" },
        { ...rule, frequency: "weekly" },
      ),
    ).toBe(false);
    expect(
      matchesRecurrenceRule(
        { ...payment, date: "2025-02-28" },
        { ...rule, date: "2024-02-29", frequency: "annually" },
      ),
    ).toBe(true);
    expect(
      matchesRecurrenceRule(
        { ...payment, date: "2025-03-30" },
        { ...rule, frequency: "annually" },
      ),
    ).toBe(false);
  });
  test("opt-outs block the payment pattern even when its billing date changes", () => {
    expect(
      matchesRecurrenceRule(
        { ...payment, date: "2024-02-15" },
        { ...rule, recurring: false, frequency: null },
      ),
    ).toBe(true);
  });
  test("does not infer a schedule from an unknown frequency or zero amount", () => {
    expect(
      matchesRecurrenceRule(payment, { ...rule, frequency: "unknown" }),
    ).toBe(false);
    expect(
      matchesRecurrenceRule({ ...payment, amount: 0 }, { ...rule, amount: 0 }),
    ).toBe(false);
  });
});
