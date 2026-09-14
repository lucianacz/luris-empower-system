import { describe, expect, it } from "vitest";
import { compareSpendingCategories, percentageChange } from "./comparison";
import type { SpendingReport } from "./report";

function report(categories: SpendingReport["categories"]): SpendingReport {
  return { categories } as SpendingReport;
}

describe("spending comparisons", () => {
  it("includes categories that exist in only one period and sorts by material difference", () => {
    const selected = report([
      { id: "food", name: "Groceries", color: "#111111", amount: 300, transactionIds: ["a"] },
      { id: "health", name: "Health", color: "#222222", amount: 50, transactionIds: ["b"] },
    ]);
    const comparison = report([
      { id: "food", name: "Groceries", color: "#111111", amount: 200, transactionIds: ["c"] },
      { id: "travel", name: "Travel", color: "#333333", amount: 500, transactionIds: ["d"] },
    ]);

    expect(compareSpendingCategories(selected, comparison)).toEqual([
      expect.objectContaining({ id: "travel", selectedAmount: 0, comparisonAmount: 500, difference: -500 }),
      expect.objectContaining({ id: "food", selectedAmount: 300, comparisonAmount: 200, difference: 100, percentageChange: 0.5 }),
      expect.objectContaining({ id: "health", selectedAmount: 50, comparisonAmount: 0, difference: 50, percentageChange: null }),
    ]);
  });

  it("does not invent a percentage when the comparison period is zero", () => {
    expect(percentageChange(100, 0)).toBeNull();
    expect(percentageChange(0, 0)).toBe(0);
    expect(percentageChange(75, 100)).toBe(-0.25);
  });
});
