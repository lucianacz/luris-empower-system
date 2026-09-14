import { describe, expect, it } from "vitest";
import { nearestHistoricalRate, observedCardRate, type PersonalHistoricalRate } from "./backfill";

const rate = (id: string, date: string, value: number): PersonalHistoricalRate => ({ id, rate_date: date, source_currency: "ARS", rate_to_reporting: value });

describe("historical ARQ conversion backfill", () => {
  it("uses the closest personal conversion date", () => {
    const rates = [rate("early", "2026-03-02", 0.00069), rate("late", "2026-03-20", 0.00068)];
    expect(nearestHistoricalRate(rates, "2026-03-18")?.id).toBe("late");
  });

  it("prefers the earlier observation when two rates are equally close", () => {
    const rates = [rate("after", "2026-03-12", 0.00068), rate("before", "2026-03-10", 0.00069)];
    expect(nearestHistoricalRate(rates, "2026-03-11")?.id).toBe("before");
  });

  it("does not invent a rate when that currency has no personal conversion", () => {
    expect(nearestHistoricalRate([], "2026-03-11")).toBeNull();
  });

  it("derives USD per local-currency unit from an imported card conversion", () => {
    expect(observedCardRate({ id: "tx", occurred_at: "2026-07-20T00:00:00Z", amount: -71.96, currency: "USD", original_amount: 100, original_currency: "CAD", status: "posted" })).toMatchObject({
      id: null,
      rate_date: "2026-07-20",
      source_currency: "CAD",
      rate_to_reporting: "0.719600000000",
    });
  });

  it("ignores observations that are not completed USD card conversions", () => {
    expect(observedCardRate({ id: "tx", occurred_at: "2026-07-20", amount: -71.96, currency: "EUR", original_amount: 100, original_currency: "CAD", status: "posted" })).toBeNull();
  });
});
