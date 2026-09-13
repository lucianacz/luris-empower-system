import { describe, expect, it } from "vitest";
import { nearestHistoricalRate, type PersonalHistoricalRate } from "./backfill";

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
});
