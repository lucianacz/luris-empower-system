import { describe, expect, it } from "vitest";
import { inferLocationSuggestions } from "./inference";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";

const row = (id: string, date: string, currency = "BRL"): WorkspaceTransaction => ({ id, occurred_at: `${date}T00:00:00Z`, posted_at: null, description: `Local merchant ${id}`, amount: "-10", currency, original_amount: null, original_currency: null, kind: "expense", status: "posted", excluded_from_totals: false, fee_amount: "0", fee_currency: null, category_id: null, category: null, account: null, metadata: {}, merchant_name: null, merchant_key: null, merchant_country: null, merchant_city: null, beneficiary_scope: "personal", reimbursement_status: "none", location_period: null });

describe("dynamic location inference", () => {
  it("never creates a stay from one foreign-currency purchase", () => {
    expect(inferLocationSuggestions([row("1", "2026-03-20")])).toEqual([]);
  });

  it("never creates a stay from a flight purchase alone", () => {
    expect(inferLocationSuggestions([{ ...row("flight", "2026-03-18", "USD"), description: "Example airline", travel_destination: "BR", travel_date: "2026-03-20" }])).toEqual([]);
  });

  it("suggests a neutral country period after repeated local activity", () => {
    const result = inferLocationSuggestions([row("1", "2026-03-20"), row("2", "2026-03-21"), row("3", "2026-03-22"), row("4", "2026-03-24")]);
    expect(result[0]).toMatchObject({ countryCode: "BR", countryName: "Brazil", startsOn: "2026-03-20" });
    expect(result[0].confidence).toBeLessThanOrEqual(0.6);
    expect(result[0].explanation).toContain("supporting evidence");
  });

  it("learns future currency-to-location clues without a code change", () => {
    const result = inferLocationSuggestions([row("1", "2026-05-01", "ZAR"), row("2", "2026-05-02", "ZAR"), row("3", "2026-05-03", "ZAR"), row("4", "2026-05-05", "ZAR")], [], [{ currency: "ZAR", countryCode: "ZA", countryName: "South Africa" }]);
    expect(result[0]).toMatchObject({ countryCode: "ZA", countryName: "South Africa" });
  });

  it("recognizes repeated CAD activity as Canada", () => {
    const result = inferLocationSuggestions([row("1", "2026-07-18", "CAD"), row("2", "2026-07-19", "CAD"), row("3", "2026-07-20", "CAD"), row("4", "2026-07-22", "CAD")]);
    expect(result[0]).toMatchObject({ countryCode: "CA", countryName: "Canada" });
  });

  it("does not treat subscription processors or Airbnb as physical stays", () => {
    const rows = [
      { ...row("1", "2026-02-01", "USD"), description: "APPLE.COM/BILL", merchant_country: "US", category: { name: "Subscriptions & software", life_area: "Digital", is_essential: false, color: "#6c63a8" } },
      { ...row("2", "2026-02-03", "USD"), description: "AIRBNB * LONDON", merchant_country: "GB" },
      { ...row("3", "2026-02-05", "USD"), description: "UBER *TRIP", merchant_country: "NL" },
      { ...row("4", "2026-02-07", "USD"), description: "ANTHROPIC CLAUDE", merchant_country: "US" },
    ];
    expect(inferLocationSuggestions(rows)).toEqual([]);
  });
});
