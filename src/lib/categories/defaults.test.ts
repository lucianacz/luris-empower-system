import { describe, expect, it } from "vitest";
import { matchKnownMerchant, resolvedKnownMerchantKind } from "./known-merchants";
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

  it("applies the confirmed merchant and provider rules", () => {
    expect(classify("SEVEN-ELEVEN PANAMA")).toBe("Groceries");
    expect(classify("CITYMALL monthly shop")).toBe("Groceries");
    expect(classify("STARBUCKS STORE")).toBe("Dining out");
    expect(classify("FARMACITY 123")).toBe("Pharmacy");
    expect(classify("STEFANIE MENAJOVSKY")).toBe("Dentist");
    expect(classify("DANIEL JESICA SOLANGE")).toBe("Therapy");
    expect(classify("LA CASA DEL HYUNDAI")).toBe("Car repairs");
    expect(classify("ENTERPRISE UVITA")).toBe("Car rental");
    expect(classify("SEPHORA&#x20;CR")).toBe("Personal care");
    expect(classify("BKG*HOTEL AT BOOKING.C")).toBe("Hotels");
  });

  it("turns negative known-provider transfers into spending but preserves positive refunds", () => {
    const psychologist = matchKnownMerchant("DANIEL JESICA SOLANGE");
    expect(resolvedKnownMerchantKind(psychologist, "-60000", "transfer")).toBe("expense");
    expect(resolvedKnownMerchantKind(psychologist, "60000", "refund")).toBe("refund");
    expect(resolvedKnownMerchantKind(matchKnownMerchant("Moved to DolarApp (ARQ)"), "-500", "unknown")).toBe("transfer");
  });
});
