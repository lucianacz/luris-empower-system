import { describe, expect, it } from "vitest";
import { julianConfirmedPeriods } from "./confirmed-trips";

describe("Julian confirmed location timeline", () => {
  it("places Julian in Argentina from July 18 through August 7", () => {
    expect(julianConfirmedPeriods.find((period) => period.countryCode === "AR")).toMatchObject({
      startsOn: "2026-07-18",
      endsOn: "2026-08-07",
      source: "user_confirmation",
    });
  });

  it("keeps the confirmed Brazil and Canada trips separate from household stays", () => {
    expect(julianConfirmedPeriods.filter((period) => period.purpose).map((period) => [period.countryCode, period.purpose])).toEqual([
      ["BR", "Personal vacation"],
      ["CA", "Personal trip"],
    ]);
  });

  it("does not overlap adjacent reconstructed periods", () => {
    for (let index = 1; index < julianConfirmedPeriods.length; index += 1) {
      const previous = julianConfirmedPeriods[index - 1];
      const current = julianConfirmedPeriods[index];
      expect(previous.endsOn === null || previous.endsOn < current.startsOn).toBe(true);
    }
  });
});
