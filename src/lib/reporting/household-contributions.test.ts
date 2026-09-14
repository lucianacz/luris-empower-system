import { describe, expect, it } from "vitest";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";
import { analyzeHouseholdContributions } from "./household-contributions";

const transaction = (id: string, role: "self" | "partner", amount: string, kind: "income" | "expense", beneficiary: "personal" | "shared", currency = "USD"): WorkspaceTransaction => ({
  id,
  occurred_at: "2026-03-10T00:00:00Z",
  description: id,
  amount,
  currency,
  kind,
  status: "posted",
  excluded_from_totals: false,
  fee_amount: "0",
  category_id: kind === "expense" ? "groceries" : null,
  category: kind === "expense" ? { name: "Groceries", life_area: "Food", is_essential: true, color: "#52796f" } : null,
  account: null,
  account_owner: { id: role, display_name: role === "self" ? "Luciana" : "Julian", role },
  paid_by: { id: role, display_name: role === "self" ? "Luciana" : "Julian", role },
  beneficiary_scope: beneficiary,
  reimbursement_status: "none",
  location_period: null,
});

describe("household contribution analysis", () => {
  it("compares actual contributions with an income-proportional reference", () => {
    const analysis = analyzeHouseholdContributions([
      transaction("luciana-income", "self", "100", "income", "personal"),
      transaction("julian-income", "partner", "300", "income", "personal"),
      transaction("luciana-shared", "self", "-60", "expense", "shared"),
      transaction("julian-shared", "partner", "-40", "expense", "shared"),
      transaction("julian-personal", "partner", "-50", "expense", "personal"),
    ], { from: "2026-01-01", to: "2026-12-31" }, "2026-09-14");

    expect(analysis.combinedIncome.amount).toBe(400);
    expect(analysis.sharedSpending.amount).toBe(100);
    expect(analysis.equalEffortRate).toBe(0.25);
    expect(analysis.contributors[0]).toMatchObject({
      name: "Luciana", income: { amount: 100 }, sharedPaid: { amount: 60 }, incomeShare: 0.25,
      personalPaid: { amount: 0 }, contributionRate: 0.6, proportionalTarget: 25, differenceFromTarget: 35,
      incomeAfterShared: 40, approximateSavings: 40, approximateSavingsRate: 0.4,
    });
    expect(analysis.contributors[1]).toMatchObject({
      name: "Julian", income: { amount: 300 }, sharedPaid: { amount: 40 }, incomeShare: 0.75,
      personalPaid: { amount: 50 }, proportionalTarget: 75, differenceFromTarget: -35,
      incomeAfterShared: 260, approximateSavings: 210, approximateSavingsRate: 0.7,
    });
  });

  it("reports shared spending with no known payer and income missing a USD value", () => {
    const unassigned = { ...transaction("unassigned", "self", "-30", "expense", "shared"), account_owner: null, paid_by: null };
    const missingFx = transaction("ars-income", "self", "100000", "income", "personal", "ARS");
    const analysis = analyzeHouseholdContributions([unassigned, missingFx], { from: "2026-01-01", to: "2026-12-31" }, "2026-09-14");

    expect(analysis.combinedIncome.amount).toBe(0);
    expect(analysis.missingIncomeFxTransactionIds).toEqual(["ars-income"]);
    expect(analysis.unassignedSharedSpending).toEqual({ amount: 30, transactionIds: ["unassigned"] });
  });
});
