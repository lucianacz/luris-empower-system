import { describe, expect, it } from "vitest";
import { matchKnownMerchant, resolvedKnownMerchantKind } from "./known-merchants";
import { defaultExpenseCategories, suggestDefaultCategory } from "./defaults";

const classify = (description: string, mccLabel: string | null = null, kind = "expense") => suggestDefaultCategory({ kind: kind as "expense", description, metadata: { mccLabel }, amount: "-10", currency: "USD" });

describe("default expense categories", () => {
  it("uses merchant descriptions and MCC labels", () => {
    expect(classify("Example purchase", "Grocery Stores, Supermarkets")).toBe("Groceries");
    expect(classify("UBER TRIP")).toBe("Transport");
    expect(classify("AIRBNB RESERVATION")).toBe("Housing");
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
    expect(classify("MINISUPER WILLY WILLYS")).toBe("Groceries");
    expect(classify("SERVICENTRO EL CONEJO")).toBe("Fuel & gas");
    expect(classify("PARKING GARAGE")).toBe("Parking");
    expect(classify("ANIBAL MARCOS PAZ")).toBe("Diving & activities");
    expect(classify("Martin Ackerman")).toBe("Friends & social");
    expect(classify("CAROLINA AFERGAN")).toBe("Friends & social");
    expect(classify("AUSOL")).toBe("Tolls & highways");
    expect(classify("SP SWEET-CHEMISTRY-SKI")).toBe("Work tests");
    expect(matchKnownMerchant("SP SWEET-CHEMISTRY-SKI")?.excludedFromTotals).toBe(true);
    expect(matchKnownMerchant("OPENAI *CHATGPT SUBSCR")?.recurrenceHint).toBe("monthly");
    expect(matchKnownMerchant("Card charge (GOOGLE *Google One)")?.recurrenceHint).toBe("annual");
    expect(matchKnownMerchant("APPLE.COM/BILL", { amount: "-9.49", currency: "USD" })?.displayName).toBe("YouTube (via Apple)");
    expect(matchKnownMerchant("APPLE.COM/BILL", { amount: "-0.99", currency: "USD" })?.displayName).toBe("iCloud (via Apple)");
    expect(matchKnownMerchant("APPLE.COM/BILL", { amount: "-12.99", currency: "USD" })).toBeNull();
  });

  it("keeps the confirmed expense hierarchy explicit", () => {
    const parentOf = (name: string) => defaultExpenseCategories.find((category) => category.name === name)?.parentName ?? null;
    expect(parentOf("Car rental")).toBe("Car");
    expect(parentOf("Car repairs")).toBe("Car");
    expect(parentOf("Cleaning")).toBe("Housing");
    expect(parentOf("Dentist")).toBe("Health");
    expect(parentOf("Diving & activities")).toBe("Travel");
    expect(parentOf("Therapy")).toBeNull();
    expect(parentOf("Workshops & classes")).toBe("Education");
    expect(defaultExpenseCategories.some((category) => category.name === "Pets")).toBe(false);
  });

  it("turns negative known-provider transfers into spending but preserves positive refunds", () => {
    const psychologist = matchKnownMerchant("DANIEL JESICA SOLANGE");
    expect(resolvedKnownMerchantKind(psychologist, "-60000", "transfer")).toBe("expense");
    expect(resolvedKnownMerchantKind(psychologist, "60000", "refund")).toBe("refund");
    expect(resolvedKnownMerchantKind(matchKnownMerchant("Moved to DolarApp (ARQ)"), "-500", "unknown")).toBe("transfer");
  });
});
