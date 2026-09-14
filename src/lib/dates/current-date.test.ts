import { describe, expect, it } from "vitest";
import { currentFinanceDate } from "./current-date";

describe("finance reporting date", () => {
  it("uses the configured local day instead of the server's UTC day", () => {
    const afterMidnightUtc = new Date("2026-09-14T00:05:00.000Z");
    expect(currentFinanceDate(afterMidnightUtc, "America/Costa_Rica")).toBe("2026-09-13");
    expect(currentFinanceDate(afterMidnightUtc, "UTC")).toBe("2026-09-14");
  });
});
