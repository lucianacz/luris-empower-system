import { describe, expect, it } from "vitest";
import { analyzeRecurring } from "./recurring";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";

const payment = (id: string, date: string, amount: string): WorkspaceTransaction => ({ id, occurred_at: `${date}T00:00:00Z`, posted_at: null, description: "Known provider", amount, currency: "ARS", original_amount: null, original_currency: null, kind: "expense", status: "posted", excluded_from_totals: false, fee_amount: "0", fee_currency: null, category_id: null, category: null, account: null, metadata: {}, merchant_name: "Known provider", merchant_key: "known provider", merchant_country: "AR", merchant_city: null, beneficiary_scope: "personal", reimbursement_status: "none", location_period: null });
const subscriptionCategory = { name: "Subscriptions & software", life_area: "Digital", is_essential: false, color: "#6c63a8" };

const knownPayment = (id: string, date: string, amount: string, description: string, merchantName: string, merchantKey: string, category = subscriptionCategory): WorkspaceTransaction => ({
  ...payment(id, date, amount),
  description,
  merchant_name: merchantName,
  merchant_key: merchantKey,
  currency: "USD",
  category_id: merchantKey,
  category,
});

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

  it("separates amount-based Apple subscriptions", () => {
    const youtube = ["2026-01-07", "2026-02-07", "2026-03-07"].map((date, index) => ({ ...payment(`youtube-${index}`, date, "-9.49"), description: "APPLE.COM/BILL", merchant_name: "YouTube (via Apple)", merchant_key: "youtube via apple", currency: "USD", category_id: "subscriptions", category: { name: "Subscriptions & software", life_area: "Digital", is_essential: false, color: "#6c63a8" } }));
    expect(analyzeRecurring(youtube, "2026-03-13").patterns[0]).toMatchObject({ providerName: "YouTube (via Apple)", frequency: "monthly", status: "active", isSubscription: true });
  });

  it("keeps the Costa Rica house seasonal without inventing missing months", () => {
    const house = ["2026-01-29", "2026-02-28", "2026-03-30", "2026-08-30"].map((date, index) => ({ ...payment(`house-${index}`, date, String(-1180 - index * 10)), description: "Cara Goldberg", merchant_name: "Casa Costa Rica · Cara Goldberg", merchant_key: "casa costa rica cara goldberg", currency: "USD", category_id: "housing", category: { name: "Housing", life_area: "Home", is_essential: true, color: "#7a6c5d" } }));
    const result = analyzeRecurring(house, "2026-09-13");
    expect(result.patterns[0]).toMatchObject({ frequency: "monthly", status: "uncertain", seasonalMonthsPerYear: 6, missingMonths: [], expectedNextPayment: null });
    expect(result.questions.some((question) => /casa costa rica|cara goldberg/i.test(question.prompt))).toBe(false);
  });

  it("recognizes confirmed Google One and ChatGPT billing schedules", () => {
    const google = { ...payment("google", "2026-04-01", "-99.99"), description: "Google One", merchant_name: "Google One", merchant_key: "google one", currency: "USD", category_id: "subscriptions", category: { name: "Subscriptions & software", life_area: "Digital", is_essential: false, color: "#6c63a8" } };
    const chatgpt = ["2026-06-14", "2026-07-14", "2026-08-14"].map((date, index) => ({ ...google, id: `chatgpt-${index}`, occurred_at: `${date}T00:00:00Z`, amount: "-100", description: "OPENAI *CHATGPT SUBSCR", merchant_name: "ChatGPT", merchant_key: "chatgpt" }));
    const patterns = analyzeRecurring([google, ...chatgpt], "2026-09-13").patterns;
    expect(patterns.find((pattern) => pattern.key === "google one")).toMatchObject({ providerName: "Google One", frequency: "annual", isSubscription: true });
    expect(patterns.find((pattern) => pattern.key === "chatgpt")).toMatchObject({ providerName: "ChatGPT", frequency: "monthly", latestAmount: 100, status: "active" });
  });

  it("accepts both April ChatGPT charges and uses the new plan as its price baseline", () => {
    const rows = [
      knownPayment("old", "2026-04-12", "-20", "OPENAI *CHATGPT SUBSCR", "ChatGPT", "chatgpt"),
      knownPayment("switch", "2026-04-14", "-81.60", "OPENAI *CHATGPT SUBSCR", "ChatGPT", "chatgpt"),
      ...["2026-05-14", "2026-06-14", "2026-07-14", "2026-08-14"].map((date, index) => knownPayment(`new-${index}`, date, "-100", "OPENAI *CHATGPT SUBSCR", "ChatGPT", "chatgpt")),
    ];
    const result = analyzeRecurring(rows, "2026-09-13");
    expect(result.patterns[0]).toMatchObject({ medianAmount: 100, latestAmount: 100 });
    expect(result.questions.some((question) => ["recurring_two_payments", "possible_multi_period_payment", "recurring_price_increase"].includes(question.type))).toBe(false);
  });

  it("remembers Claude's inactive months and confirmed higher-priced plan", () => {
    const rows = [
      knownPayment("mar", "2026-03-13", "-20", "ANTHROPIC* CLAUDE SUB", "Claude", "claude"),
      knownPayment("apr", "2026-04-13", "-20", "ANTHROPIC* CLAUDE SUB", "Claude", "claude"),
      knownPayment("jul", "2026-07-29", "-20", "ANTHROPIC* CLAUDE SUB", "Claude", "claude"),
      knownPayment("aug", "2026-08-25", "-97.48", "ANTHROPIC* CLAUDE SUB", "Claude", "claude"),
    ];
    const result = analyzeRecurring(rows, "2026-09-13");
    expect(result.patterns[0]).toMatchObject({ medianAmount: 97.48, missingMonths: [] });
    expect(result.questions.some((question) => ["recurring_missing_month", "recurring_price_increase"].includes(question.type))).toBe(false);
  });

  it("does not invent an iCloud bill before the subscription resumed", () => {
    const dates = ["2025-09-13", "2025-10-13", "2025-11-13", "2026-01-13", "2026-02-13"];
    const rows = dates.map((date, index) => knownPayment(`icloud-${index}`, date, "-0.99", "APPLE.COM/BILL", "iCloud (via Apple)", "icloud via apple"));
    const result = analyzeRecurring(rows, "2026-02-20");
    expect(result.patterns[0].missingMonths).toEqual([]);
    expect(result.questions.some((question) => question.type === "recurring_missing_month")).toBe(false);
  });

  it("treats Starlink as shared and partner-paid without asking about months absent from this account", () => {
    const homeCategory = { name: "Bills & utilities", life_area: "Home", is_essential: true, color: "#557a95" };
    const rows = ["2026-03-29", "2026-05-28", "2026-06-28", "2026-07-28"].map((date, index) => knownPayment(`starlink-${index}`, date, "-57", "STARLINK INTERNET", "Starlink Internet", "starlink internet", homeCategory));
    const result = analyzeRecurring(rows, "2026-09-13");
    expect(result.patterns[0]).toMatchObject({ missingMonths: [], expectedNextPayment: null, scheduleNote: expect.stringContaining("paid by partner") });
    expect(result.questions.some((question) => /starlink/i.test(question.prompt))).toBe(false);
  });
});
