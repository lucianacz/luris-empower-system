import { describe, expect, it } from "vitest";
import { buildSpendingReport } from "./report";
import { rangeForPreset } from "./periods";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";
import { demoWorkspace } from "@/lib/workspace/demo";

const expense = (id: string, date: string, amount: string, category = "Groceries"): WorkspaceTransaction => ({
  id, occurred_at: `${date}T00:00:00Z`, posted_at: null, description: `Merchant ${id}`, amount, currency: "USD", original_amount: null, original_currency: null,
  kind: "expense", status: "posted", excluded_from_totals: false, fee_amount: "0", fee_currency: null, category_id: category,
  category: { name: category, life_area: "Food", is_essential: true, is_extraordinary: false, color: "#52796f" }, account: null, metadata: {}, merchant_name: null, merchant_key: null, merchant_country: null, merchant_city: null, beneficiary_scope: "personal", reimbursement_status: "none", location_period: null,
});

describe("traceable USD spending reports", () => {
  it("uses YTD by default, includes zero months, and separates the current partial month", () => {
    const report = buildSpendingReport([
      expense("jan", "2026-01-10", "-100"), expense("mar", "2026-03-10", "-200"), expense("sep", "2026-09-10", "-50"),
    ], rangeForPreset("ytd", "2026-09-13"), "2026-09-13");
    expect(report.total).toEqual({ amount: 350, transactionIds: ["jan", "mar", "sep"] });
    expect(report.monthly).toHaveLength(9);
    expect(report.completedAverage.amount).toBe(37.5);
    expect(report.completedAverage.monthCount).toBe(8);
    expect(report.currentPartial).toMatchObject({ amount: 50, month: "2026-09", included: true });
  });

  it("keeps unconverted non-USD rows visible as a data-quality issue", () => {
    const ars = { ...expense("ars", "2026-02-10", "-60000"), currency: "ARS" };
    const report = buildSpendingReport([ars], { from: "2026-01-01", to: "2026-09-13" }, "2026-09-13");
    expect(report.total.amount).toBe(0);
    expect(report.missingFxTransactionIds).toEqual(["ars"]);
  });

  it("shows cash-flow and service-month allocation without double counting", () => {
    const insurance = { ...expense("insurance", "2026-07-05", "-240", "Health insurance"), expense_allocations: [
      { id: "a", service_month: "2026-06-01", amount: "115", currency: "USD", reporting_amount: "115", reporting_currency: "USD", is_estimated: false },
      { id: "b", service_month: "2026-07-01", amount: "125", currency: "USD", reporting_amount: "125", reporting_currency: "USD", is_estimated: false },
    ] };
    const report = buildSpendingReport([insurance], { from: "2026-06-01", to: "2026-07-31" }, "2026-09-13");
    expect(report.total.amount).toBe(240);
    expect(report.normalizedTotal.amount).toBe(240);
    expect(report.monthly.map((month) => [month.month, month.amount, month.normalizedAmount])).toEqual([["2026-06", 0, 115], ["2026-07", 240, 125]]);
  });

  it("reconciles the former USD 11,824.42 example to exact transactions", () => {
    const report = buildSpendingReport(demoWorkspace.transactions, { from: "2026-03-01", to: "2026-08-31" }, demoWorkspace.asOfDate);
    expect(report.total.amount).toBe(11824.42);
    expect(report.total.transactionIds).toHaveLength(46);
    expect(Object.fromEntries(report.monthly.map((month) => [month.month, month.amount]))).toEqual({
      "2026-03": 1640,
      "2026-04": 1812,
      "2026-05": 1728,
      "2026-06": 2054,
      "2026-07": 2406,
      "2026-08": 2184.42,
    });
  });
});
