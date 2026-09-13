import { describe, expect, it } from "vitest";
import { findCoverageGaps } from "./coverage";

describe("statement coverage", () => {
  it("reports material gaps but tolerates adjacent or overlapping periods", () => {
    expect(findCoverageGaps([
      { start: "2026-01-01", end: "2026-01-31" },
      { start: "2026-02-01", end: "2026-02-28" },
      { start: "2026-03-05", end: "2026-03-31" },
    ], 1)).toEqual([{ start: "2026-03-01", end: "2026-03-04", days: 4 }]);
  });
});
