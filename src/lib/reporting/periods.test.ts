import { describe, expect, it } from "vitest";
import { completedMonthKeys, rangeForPreset } from "./periods";

describe("reporting periods", () => {
  it("resolves current, previous, and year-to-date periods", () => {
    expect(rangeForPreset("current_month", "2026-09-13")).toEqual({ from: "2026-09-01", to: "2026-09-13" });
    expect(rangeForPreset("previous_month", "2026-09-13")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(rangeForPreset("ytd", "2026-09-13")).toEqual({ from: "2026-01-01", to: "2026-09-13" });
  });

  it("averages only complete calendar months inside a custom range", () => {
    expect(completedMonthKeys({ from: "2026-01-15", to: "2026-04-30" }, "2026-09-13")).toEqual(["2026-02", "2026-03", "2026-04"]);
  });
});
