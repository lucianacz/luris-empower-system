import { describe, expect, it } from "vitest";
import { deduplicateTransactionRows, markDuplicateFingerprints, uniqueByFingerprint } from "./runtime-duplicates";

describe("runtime duplicate safeguards", () => {
  it("keeps the earliest imported copy and excludes later statement overlaps", () => {
    const rows = markDuplicateFingerprints([
      { id: "later", fingerprint: "same", created_at: "2026-02-01", excluded_from_totals: false, metadata: {} },
      { id: "first", fingerprint: "same", created_at: "2026-01-01", excluded_from_totals: false, metadata: {} },
      { id: "other", fingerprint: "other", created_at: "2026-02-01", excluded_from_totals: false, metadata: {} },
    ]);

    expect(rows.find((row) => row.id === "first")?.excluded_from_totals).toBe(false);
    expect(rows.find((row) => row.id === "later")).toMatchObject({ excluded_from_totals: true, metadata: { isDuplicate: true, duplicateOfTransactionId: "first" } });
    expect(rows.find((row) => row.id === "other")?.excluded_from_totals).toBe(false);
  });

  it("removes repeated fingerprints before analysis", () => {
    expect(uniqueByFingerprint([{ fingerprint: "a" }, { fingerprint: "a" }, { fingerprint: "b" }])).toHaveLength(2);
  });

  it("returns one visible transaction for overlapping statement copies", () => {
    const rows = deduplicateTransactionRows([
      { id: "first", fingerprint: "same", created_at: "2026-01-01", excluded_from_totals: false, metadata: {} },
      { id: "later", fingerprint: "same", created_at: "2026-02-01", excluded_from_totals: false, metadata: {} },
    ]);
    expect(rows).toEqual([{ id: "first", fingerprint: "same", created_at: "2026-01-01", excluded_from_totals: false, metadata: {} }]);
  });
});
