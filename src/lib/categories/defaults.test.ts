import { describe, expect, it } from "vitest";
import { suggestDefaultCategory } from "./defaults";

const classify = (description: string, mccLabel: string | null = null, kind = "expense") => suggestDefaultCategory({ kind: kind as "expense", description, metadata: { mccLabel } });

describe("default expense categories", () => {
  it("uses merchant descriptions and MCC labels", () => {
    expect(classify("Example purchase", "Grocery Stores, Supermarkets")).toBe("Groceries");
    expect(classify("UBER TRIP")).toBe("Transport");
    expect(classify("AIRBNB RESERVATION")).toBe("Travel");
    expect(classify("OPENAI subscription")).toBe("Subscriptions & software");
  });

  it("does not force unknown merchants into a misleading category", () => {
    expect(classify("UNRECOGNIZED MERCHANT 123")).toBeNull();
    expect(classify("Withdrawal to owned account", null, "transfer")).toBeNull();
  });
});
