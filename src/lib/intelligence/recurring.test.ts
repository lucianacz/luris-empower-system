import { describe, expect, it } from "vitest";
import { analyzeRecurring } from "./recurring";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";

const payment = (id: string, date: string, amount: string): WorkspaceTransaction => ({ id, occurred_at: `${date}T00:00:00Z`, posted_at: null, description: "Known provider", amount, currency: "ARS", original_amount: null, original_currency: null, kind: "expense", status: "posted", excluded_from_totals: false, fee_amount: "0", fee_currency: null, category_id: null, category: null, account: null, metadata: {}, merchant_name: "Known provider", merchant_key: "known provider", merchant_country: "AR", merchant_city: null, beneficiary_scope: "personal", reimbursement_status: "none", location_period: null });

describe("recurring expense intelligence", () => {
  it("asks an evidence-backed question for a missing month and a doubled payment", () => {
    const result = analyzeRecurring([payment("may", "2026-05-05", "-60000"), payment("jul", "2026-07-05", "-125000"), payment("aug", "2026-08-05", "-65000")], "2026-09-13");
    expect(result.patterns[0]).toMatchObject({ frequency: "monthly", missingMonths: ["2026-06"] });
    expect(result.questions.some((question) => question.type === "recurring_missing_month")).toBe(true);
    expect(result.questions.some((question) => question.type === "possible_multi_period_payment")).toBe(true);
    expect(result.questions[0].transactionIds.length).toBeGreaterThan(0);
  });

  it("keeps Hospital Alemán monthly even when the payment history has large gaps", () => {
    const hospital = (id: string, date: string, amount: string) => ({ ...payment(id, date, amount), description: "Hospital Alemán", merchant_name: "Hospital Alemán", merchant_key: "hospital alemán" });
    const result = analyzeRecurring([hospital("jan", "2026-01-05", "-100"), hospital("apr", "2026-04-05", "-120"), hospital("jul", "2026-07-05", "-250"), hospital("sep", "2026-09-05", "-260")], "2026-09-13");
    expect(result.patterns[0]).toMatchObject({ frequency: "monthly", status: "active" });
    expect(result.patterns[0].missingMonths).toContain("2026-08");
    expect(result.questions.some((question) => question.type === "recurring_missing_month")).toBe(true);
  });

  it("detects an annual subscription from two yearly charges", () => {
    const first = { ...payment("annual-1", "2025-04-12", "-240"), currency: "USD", category_id: "subscriptions", category: { name: "Subscriptions & software", life_area: "Digital", is_essential: false, color: "#6c63a8" } };
    const second = { ...first, id: "annual-2", occurred_at: "2026-04-12T00:00:00Z" };
    expect(analyzeRecurring([first, second], "2026-09-13").patterns[0]).toMatchObject({ frequency: "annual", isSubscription: true });
  });

  it("does not call repeated everyday purchases recurring or multi-period", () => {
    const category = { name: "Groceries", life_area: "Food", is_essential: true, color: "#52796f" };
    const rows = [
      { ...payment("a", "2026-08-02", "-4.73"), description: "7-ELEVEN", merchant_name: "7-Eleven", merchant_key: "7 eleven", category_id: "groceries", category },
      { ...payment("b", "2026-08-06", "-5.12"), description: "7-ELEVEN", merchant_name: "7-Eleven", merchant_key: "7 eleven", category_id: "groceries", category },
      { ...payment("c", "2026-08-10", "-9.80"), description: "SEVEN-ELEVEN", merchant_name: "7-Eleven", merchant_key: "7 eleven", category_id: "groceries", category },
      { ...payment("d", "2026-08-13", "-4.95"), description: "SEVEN-ELEVEN", merchant_name: "7-Eleven", merchant_key: "7 eleven", category_id: "groceries", category },
    ];
    const result = analyzeRecurring(rows, "2026-09-13");
    expect(result.patterns).toHaveLength(0);
    expect(result.questions.some((question) => question.type === "possible_multi_period_payment")).toBe(false);
  });
});
