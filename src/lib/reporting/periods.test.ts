import { describe, expect, it } from "vitest";
import { completedMonthKeys, previousComparableRange, rangeForMonth, rangeForPreset, throughLastCompletedMonth } from "./periods";

describe("reporting periods", () => {
  it("resolves the dashboard presets and custom months", () => {
    expect(rangeForPreset("current_month", "2026-09-13")).toEqual({ from: "2026-09-01", to: "2026-09-13" });
    expect(rangeForPreset("ytd", "2026-09-13")).toEqual({ from: "2026-01-01", to: "2026-09-13" });
    expect(rangeForPreset("last_year", "2026-09-13")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(rangeForPreset("all_records", "2026-09-13")).toEqual({ from: "2025-01-01", to: "2026-09-13" });
    expect(rangeForMonth("2026-08", "2026-09-13")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(rangeForMonth("2026-09", "2026-09-13")).toEqual({ from: "2026-09-01", to: "2026-09-13" });
  });

  it("averages only complete calendar months inside a custom range", () => {
    expect(completedMonthKeys({ from: "2026-01-15", to: "2026-04-30" }, "2026-09-13")).toEqual(["2026-02", "2026-03", "2026-04"]);
  });

  it("limits income analysis to the last completed month", () => {
    expect(throughLastCompletedMonth({ from: "2026-01-01", to: "2026-09-14" }, "2026-09-14")).toEqual({ from: "2026-01-01", to: "2026-08-31" });
    expect(throughLastCompletedMonth({ from: "2025-01-01", to: "2025-12-31" }, "2026-09-14")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(throughLastCompletedMonth({ from: "2026-09-01", to: "2026-09-14" }, "2026-09-14")).toBeNull();
  });

  it("builds the immediately preceding period with the same number of days", () => {
    expect(previousComparableRange({ from: "2026-09-01", to: "2026-09-13" })).toEqual({ from: "2026-08-19", to: "2026-08-31" });
    expect(previousComparableRange({ from: "2026-02-01", to: "2026-02-28" })).toEqual({ from: "2026-01-04", to: "2026-01-31" });
    expect(previousComparableRange({ from: "2026-09-13", to: "2026-09-01" })).toEqual({ from: "2026-08-19", to: "2026-08-31" });
  });
});
