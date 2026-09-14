import { describe, expect, it } from "vitest";
import { createTransaction } from "./adapters/helpers";
import { partitionDuplicates } from "./duplicates";

describe("duplicate detection", () => {
  it("uses the full fingerprint so a reused provider id can preserve a reversal pair", () => {
    const first = createTransaction({ provider: "deel", sourceId: "source-1", occurredAt: "2026-08-01T00:00:00.000Z", description: "Example", amount: -20, currency: "USD", kind: "expense" });
    const second = { ...first, sourceId: null };
    const reversal = createTransaction({ provider: "deel", sourceId: "source-1", occurredAt: "2026-08-03T00:00:00.000Z", description: "Example refund", amount: 20, currency: "USD", kind: "refund" });
    const result = partitionDuplicates([first, second, reversal], [{ sourceId: "source-1", fingerprint: "different" }]);
    expect(result.accepted).toEqual([first, reversal]);
    expect(result.duplicates).toEqual([second]);
  });
});
