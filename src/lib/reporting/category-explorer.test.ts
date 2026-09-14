import { describe, expect, it } from "vitest";
import { categoryIdsForPreset, summarizeCategorySelection } from "./category-explorer";
import type { SpendingGroup } from "./report";

const categories: SpendingGroup[] = [
  { id: "repairs", name: "Car repairs", amount: 300, transactionIds: ["a"], color: "#111" },
  { id: "fuel", name: "Fuel & gas", amount: 100, transactionIds: ["b"], color: "#222" },
  { id: "food", name: "Groceries", amount: 80, transactionIds: ["c"], color: "#333" },
];

describe("category explorer", () => {
  it("builds an all-car selection and one traceable total", () => {
    const ids = categoryIdsForPreset(categories, "all-car");
    expect(ids).toEqual(["repairs", "fuel"]);
    expect(summarizeCategorySelection(categories, ids)).toEqual({ amount: 400, transactionIds: ["a", "b"] });
  });
});

