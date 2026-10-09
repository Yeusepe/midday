import { describe, expect, test } from "bun:test";
import { prepareUpdateData } from "./enrichment-helpers";
import { type EnrichmentResult, enrichmentSchema } from "./enrichment-schema";

const incoming = { amount: 100, categorySlug: null, merchantName: null };
const result = (
  category: EnrichmentResult["category"],
  confidence = 0.95,
): EnrichmentResult => ({
  merchant: null,
  merchantConfidence: 0,
  category,
  categoryConfidence: confidence,
});

describe("transaction categorization", () => {
  test.each([
    "income",
    "interest-income",
    "other-income",
  ] as const)("accepts confident %s for an incoming deposit", (category) => {
    expect(enrichmentSchema.safeParse(result(category)).success).toBe(true);
    expect(prepareUpdateData(incoming, result(category))).toEqual({
      categorySlug: category,
    });
  });

  test.each([
    "transfer",
    "internal-transfer",
    "loan-proceeds",
    "capital-investment",
    "travel",
  ] as const)("preserves the non-revenue purpose of a positive %s transaction", (category) => {
    expect(prepareUpdateData(incoming, result(category))).toEqual({
      categorySlug: category,
    });
  });

  test("flags ambiguous positive deposits instead of assuming revenue", () => {
    expect(prepareUpdateData(incoming, result("income", 0.4))).toEqual({
      categorySlug: "uncategorized",
    });
    expect(prepareUpdateData(incoming, result(null))).toEqual({
      categorySlug: "uncategorized",
    });
  });

  test("does not overwrite a user category", () => {
    expect(
      prepareUpdateData(
        { ...incoming, categorySlug: "transfer" },
        result("income"),
      ),
    ).toEqual({});
  });

  test("does not label an outgoing payment or zero amount as income", () => {
    for (const amount of [-100, 0]) {
      expect(
        prepareUpdateData({ ...incoming, amount }, result("income")),
      ).toEqual({ categorySlug: "uncategorized" });
    }
  });

  test("continues to categorize outgoing expenses", () => {
    expect(
      prepareUpdateData({ ...incoming, amount: -100 }, result("software")),
    ).toEqual({ categorySlug: "software" });
  });
});
