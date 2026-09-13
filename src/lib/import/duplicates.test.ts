import { describe, expect, it } from "vitest";
import { createTransaction } from "./adapters/helpers";
import { partitionDuplicates } from "./duplicates";

describe("duplicate detection", () => {
  it("uses provider ids first and fingerprints as a stable fallback", () => {
    const first = createTransaction({ provider: "deel", sourceId: "source-1", occurredAt: "2026-08-01T00:00:00.000Z", description: "Example", amount: -20, currency: "USD", kind: "expense" });
    const second = { ...first, sourceId: null };
    const result = partitionDuplicates([first, second], [{ sourceId: "source-1", fingerprint: "different" }]);
    expect(result.accepted).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });
});
