import { describe, expect, it } from "vitest";
import { createTransaction } from "@/lib/import/adapters/helpers";
import { cleanDescription, decodeTextEntities } from "@/lib/import/normalize";

describe("import normalization", () => {
  it("decodes exported HTML entities before matching merchants", () => {
    expect(decodeTextEntities("SEPHORA&#x20;CR &amp; BEAUTY")).toBe("SEPHORA CR & BEAUTY");
    expect(cleanDescription("  ENTERPRISE&#32;UVITA  ")).toBe("ENTERPRISE UVITA");
  });

  it("retains zero-value rows as evidence but excludes them from totals", () => {
    expect(createTransaction({ provider: "deel", occurredAt: "2026-04-28T00:00:00Z", description: "Declined Enterprise", amount: 0, currency: "USD", kind: "expense" })).toMatchObject({ amount: "0", excludedFromTotals: true });
  });
});
