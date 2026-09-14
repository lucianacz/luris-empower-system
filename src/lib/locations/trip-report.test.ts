import { describe, expect, it } from "vitest";
import { buildTripExpenseReport, groupEquivalentTripPeriods, isSharedTripGroup, isTripPeriod, transactionIdsForLocationPeriod } from "./trip-report";
import type { WorkspaceLocationPeriod, WorkspaceTransaction } from "@/lib/workspace/demo";

const period: WorkspaceLocationPeriod = {
  id: "mexico-trip",
  starts_on: "2026-01-10",
  ends_on: "2026-03-06",
  status: "confirmed",
  period_type: "temporary_stay",
  trip_purpose: "Shared stay",
  confidence: 1,
  explanation: "Confirmed by the user.",
  evidence: {},
  location: { id: "mx", name: "Mexico", country_code: "MX", country_name: "Mexico", default_currency: "MXN" },
};

function expense(id: string, date: string, amount: string, category: string): WorkspaceTransaction {
  return {
    id,
    occurred_at: `${date}T00:00:00Z`,
    description: id,
    amount,
    currency: "USD",
    kind: "expense",
    status: "posted",
    excluded_from_totals: false,
    fee_amount: "0",
    category_id: category,
    category: { name: category, life_area: category === "Flights" ? "Travel" : "Food", is_essential: false, is_extraordinary: category === "Flights", color: "#52796f" },
    account: null,
    metadata: {},
    location_period: null,
  };
}

describe("trip expense reports", () => {
  it("includes advance bookings linked by travel date and keeps every amount traceable", () => {
    const flight = { ...expense("flight", "2025-12-02", "-400", "Flights"), travel_date: "2026-01-10", travel_destination: "MX" };
    const restaurant = { ...expense("restaurant", "2026-02-03", "-80", "Dining out"), location_period: period };
    const report = buildTripExpenseReport(period, [flight, restaurant], "2026-09-14").report;

    expect(report.range).toEqual({ from: "2025-12-02", to: "2026-02-03" });
    expect(report.total).toEqual({ amount: 480, transactionIds: ["flight", "restaurant"] });
    expect(report.categories.map((category) => [category.name, category.amount])).toEqual([["Flights", 400], ["Dining out", 80]]);
  });

  it("excludes subscriptions and Papaya Kids even when they are linked to the stay", () => {
    const hotel = { ...expense("hotel", "2026-02-02", "-200", "Hotels"), location_period: period };
    const subscription = { ...expense("subscription", "2026-02-03", "-20", "Subscriptions & software"), location_period: period };
    const business = { ...expense("business", "2026-02-04", "-100", "Papaya Kids"), location_period: period };
    const inferredSubscription = { ...expense("inferred", "2026-02-05", "-100", "Dining out"), description: "OPENAI subscription", category_id: null, category: null, location_period: period };

    expect(transactionIdsForLocationPeriod(period, [hotel, subscription, business, inferredSubscription], "2026-09-14")).toEqual(["hotel"]);
    expect(buildTripExpenseReport(period, [hotel, subscription, business, inferredSubscription], "2026-09-14").report.total.amount).toBe(200);
  });

  it("recognizes temporary stays or confirmed periods with an explicit purpose as trips", () => {
    expect(isTripPeriod(period)).toBe(true);
    expect(isTripPeriod({ ...period, period_type: "home_base", trip_purpose: null })).toBe(false);
    expect(isTripPeriod({ ...period, period_type: "stay", trip_purpose: "Work trip" })).toBe(true);
    expect(isTripPeriod({ ...period, status: "suggested" })).toBe(false);
  });

  it("can combine equivalent household periods without losing either person's expenses", () => {
    const partnerPeriod = { ...period, id: "mexico-trip-partner" };
    const luciana = { ...expense("luciana", "2026-02-01", "-50", "Groceries"), location_period: period };
    const julian = { ...expense("julian", "2026-02-02", "-70", "Dining out"), location_period: partnerPeriod };
    const report = buildTripExpenseReport(period, [luciana, julian], "2026-09-14", [period.id, partnerPeriod.id]).report;

    expect(report.total).toEqual({ amount: 120, transactionIds: ["luciana", "julian"] });
  });

  it("groups matching household trips but keeps explicitly individual trips separate", () => {
    const luciana = { ...period, person_id: "luciana", person: { id: "luciana", display_name: "Luciana", role: "self" } };
    const julian = { ...period, id: "mexico-julian", person_id: "julian", person: { id: "julian", display_name: "Julian", role: "partner" } };
    const julianPersonal = { ...julian, id: "canada-julian", location: { ...julian.location, id: "ca", name: "Canada", country_name: "Canada", country_code: "CA" }, starts_on: "2026-05-15", ends_on: "2026-05-26", trip_purpose: "Personal trip" };
    const lucianaWork = { ...luciana, id: "canada-luciana", location: julianPersonal.location, starts_on: "2026-05-15", ends_on: "2026-05-26", trip_purpose: "Work trip" };
    const groups = groupEquivalentTripPeriods([luciana, julian, julianPersonal, lucianaWork], true);

    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.length === 2)?.map((item) => item.id)).toEqual([period.id, "mexico-julian"]);
    expect(isSharedTripGroup(groups.find((group) => group.length === 2) ?? [])).toBe(true);
    expect(groups.filter((group) => !isSharedTripGroup(group))).toHaveLength(2);
  });
});
