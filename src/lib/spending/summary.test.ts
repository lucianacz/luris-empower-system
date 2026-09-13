import { describe, expect, it } from "vitest";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";
import { buildSpendingSummary } from "./summary";

const base: WorkspaceTransaction = { id: "1", occurred_at: "2026-01-15T00:00:00Z", description: "Market", amount: "-100", currency: "USD", kind: "expense", status: "posted", excluded_from_totals: false, fee_amount: "0", category_id: "food", category: { name: "Groceries", life_area: "Food", is_essential: true, color: "#52796f" }, account: null, expense_splits: [] };

describe("spending summary", () => {
  it("separates life expenses, household shares, refunds, and transfer fees", () => {
    const result = buildSpendingSummary([
      base,
      { ...base, id: "2", occurred_at: "2026-03-01T00:00:00Z", amount: "-80", expense_splits: [{ id: "s", split_kind: "personal", label: "Mine", percentage: "0.5", amount: null }] },
      { ...base, id: "3", kind: "refund", amount: "20" },
      { ...base, id: "4", kind: "transfer", amount: "-500", excluded_from_totals: true, fee_amount: "5", category: null, category_id: null },
    ])[0];
    expect(result.total).toBe(165);
    expect(result.averagePerMonth).toBe(55);
    expect(result.personal).toBe(125);
    expect(result.household).toBe(40);
    expect(result.essential).toBe(165);
  });
});
