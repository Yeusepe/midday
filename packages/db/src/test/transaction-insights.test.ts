import { describe, expect, test } from "bun:test";
import {
  buildTransactionInsights,
  type InsightTransaction,
} from "../utils/transaction-insights";

const params = {
  from: "2026-03-01",
  to: "2026-03-31",
  asOf: "2026-03-01",
  currency: "USD",
};
const payment = (
  values: Partial<InsightTransaction> = {},
): InsightTransaction => ({
  id: crypto.randomUUID(),
  teamId: "team",
  name: "Subscription",
  merchantName: null,
  bankAccountId: "account",
  amount: -30,
  currency: "USD",
  convertedAmount: -30,
  date: "2026-02-28",
  recurring: true,
  frequency: "monthly",
  ...values,
});

describe("transaction insights", () => {
  test("keeps simultaneous identical payments rather than dropping one commitment", () => {
    const result = buildTransactionInsights([payment(), payment()], params);
    expect(result.series).toHaveLength(2);
    expect(result.forecast.monthlyExpenses).toBe(60);
  });

  test("weekly schedules advance from the latest payment when posting dates drift", () => {
    const result = buildTransactionInsights(
      [
        payment({ frequency: "weekly", date: "2026-01-30" }),
        payment({ frequency: "weekly", date: "2026-02-05" }),
      ],
      { ...params, asOf: "2026-02-06" },
    );
    expect(result.series).toHaveLength(1);
    expect(result.series[0]?.nextDate).toBe("2026-02-12");
  });

  test("keeps recurring history outside the selected period and does not cap at ten", () => {
    const result = buildTransactionInsights(
      Array.from({ length: 15 }, (_, index) =>
        payment({ name: `Vendor ${index}` }),
      ),
      params,
    );
    expect(result.series).toHaveLength(15);
    expect(result.actuals.count).toBe(0);
    expect(result.forecast.expenses).toBe(450);
  });

  test("separates actual income/expense and unmarked payments, without summing payment history into commitments", () => {
    const result = buildTransactionInsights(
      [
        payment({ date: "2026-03-01" }),
        payment({ date: "2026-02-01" }),
        payment({ date: "2026-03-01", recurring: false, convertedAmount: -50 }),
        payment({ date: "2026-03-01", amount: 100, convertedAmount: 100 }),
        payment({
          date: "2026-03-01",
          amount: 20,
          convertedAmount: 20,
          recurring: null,
        }),
      ],
      params,
    );
    expect(result.actuals).toMatchObject({
      count: 4,
      recurringExpenses: 30,
      otherExpenses: 50,
      recurringIncome: 100,
      otherIncome: 20,
    });
    expect(result.series).toHaveLength(2);
    expect(result.forecast.monthlyExpenses).toBe(30);
    expect(
      result.series.find((item) => item.type === "expense")?.observations,
    ).toBe(2);
  });

  test("uses calendar months without drifting after February and excludes horizon end", () => {
    const result = buildTransactionInsights(
      [payment({ date: "2026-01-31" }), payment()],
      params,
    );
    expect(result.series[0]?.nextDate).toBe("2026-03-31");
    expect(result.upcoming).toHaveLength(0);
    const march = buildTransactionInsights(
      [payment({ date: "2026-01-31" }), payment()],
      { ...params, asOf: "2026-03-02" },
    );
    expect(march.upcoming[0]?.date).toBe("2026-03-31");
  });

  test("projects each weekly payment, including today, rather than using a monthly average", () => {
    const result = buildTransactionInsights(
      [
        payment({
          date: "2026-02-22",
          frequency: "weekly",
          amount: -10,
          convertedAmount: -10,
        }),
      ],
      params,
    );
    expect(result.upcoming.map((row) => row.date)).toEqual([
      "2026-03-01",
      "2026-03-08",
      "2026-03-15",
      "2026-03-22",
      "2026-03-29",
    ]);
    expect(result.forecast.expenses).toBe(50);
    expect(result.forecast.monthlyExpenses).toBe(43.33);
  });

  test("handles annual leap dates and biweekly income", () => {
    const annual = buildTransactionInsights(
      [
        payment({
          date: "2024-02-29",
          frequency: "annually",
          amount: -120,
          convertedAmount: -120,
        }),
      ],
      { ...params, asOf: "2025-02-01" },
    );
    expect(annual.upcoming[0]?.date).toBe("2025-02-28");
    expect(annual.forecast.monthlyExpenses).toBe(10);
    const biweekly = buildTransactionInsights(
      [
        payment({
          date: "2026-02-20",
          frequency: "biweekly",
          amount: 100,
          convertedAmount: 100,
        }),
      ],
      params,
    );
    expect(biweekly.forecast).toMatchObject({
      income: 200,
      expenses: 0,
      net: 200,
    });
  });

  test("flags stale and ambiguous schedules instead of inventing future dates", () => {
    const result = buildTransactionInsights(
      [
        payment({ date: "2025-01-01" }),
        ...["unknown", "irregular", "semi_monthly", null].map((frequency) =>
          payment({ frequency }),
        ),
      ],
      params,
    );
    expect(result.series).toHaveLength(5);
    expect(result.forecast).toMatchObject({
      needsReview: 5,
      expenses: 0,
      monthlyExpenses: 0,
    });
    expect(result.upcoming).toEqual([]);
  });

  test("keeps accounts, currencies, directions and different subscription amounts separate", () => {
    const result = buildTransactionInsights(
      [
        payment(),
        payment({ bankAccountId: "second" }),
        payment({ currency: "EUR" }),
        payment({ amount: 30, convertedAmount: 30 }),
        payment({ amount: -100, convertedAmount: -100 }),
      ],
      params,
    );
    expect(result.series).toHaveLength(5);
  });

  test("uses converted values and makes missing conversions visible without treating them as zero-valued payments", () => {
    const result = buildTransactionInsights(
      [
        payment({
          date: "2026-03-01",
          currency: "COP",
          amount: -100000,
          convertedAmount: -25,
        }),
        payment({
          date: "2026-03-01",
          name: "No rate",
          currency: "EUR",
          convertedAmount: null,
        }),
        payment({ date: "2026-03-02", name: "Future record" }),
      ],
      params,
    );
    expect(result.actuals).toMatchObject({
      recurringExpenses: 25,
      count: 2,
      missingConversions: 1,
    });
    expect(result.forecast.missingConversions).toBe(1);
    expect(
      result.series.find((item) => item.name === "No rate")?.amount,
    ).toBeNull();
    expect(result.series).toHaveLength(2);
  });
});
