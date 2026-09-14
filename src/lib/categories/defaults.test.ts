import { describe, expect, it } from "vitest";
import { matchKnownMerchant, resolvedKnownMerchantKind } from "./known-merchants";
import { defaultExpenseCategories, suggestDefaultCategory } from "./defaults";

const classify = (description: string, mccLabel: string | null = null, kind = "expense", mcc: string | null = null) => suggestDefaultCategory({ kind: kind as "expense", description, metadata: { mccLabel, mcc }, amount: "-10", currency: "USD" });

describe("default expense categories", () => {
  it("uses merchant descriptions and MCC labels", () => {
    expect(classify("Example purchase", "Grocery Stores, Supermarkets")).toBe("Groceries");
    expect(classify("UBER TRIP")).toBe("Transport");
    expect(classify("AIRBNB RESERVATION")).toBe("Housing");
    expect(classify("OPENAI subscription")).toBe("Subscriptions & software");
    expect(classify("Truncated airline descriptor", "Miscellaneous", "expense", "4511")).toBe("Flights");
    expect(classify("Unknown lodging descriptor", "Miscellaneous", "expense", "7011")).toBe("Hotels");
    expect(classify("Unknown medical descriptor", "Miscellaneous", "expense", "8011")).toBe("Private health");
  });

  it("does not force unknown merchants into a misleading category", () => {
    expect(classify("UNRECOGNIZED MERCHANT 123")).toBeNull();
    expect(classify("Withdrawal to owned account", null, "transfer")).toBeNull();
  });

  it("applies the confirmed merchant and provider rules", () => {
    expect(classify("SEVEN-ELEVEN PANAMA")).toBe("Groceries");
    expect(classify("CITYMALL monthly shop")).toBe("Groceries");
    expect(classify("STARBUCKS STORE")).toBe("Dining out");
    expect(classify("PEDIDOS YA MARKETPLACE")).toBe("Dining out");
    expect(classify("FARMACITY 123")).toBe("Pharmacy");
    expect(classify("STEFANIE MENAJOVSKY")).toBe("Dentist");
    expect(classify("DANIEL JESICA SOLANGE")).toBe("Therapy");
    expect(classify("LA CASA DEL HYUNDAI")).toBe("Car repairs");
    expect(classify("ENTERPRISE UVITA")).toBe("Car rental");
    expect(classify("SEPHORA&#x20;CR")).toBe("Personal care");
    expect(classify("BKG*HOTEL AT BOOKING.C")).toBe("Hotels");
    expect(classify("MINISUPER WILLY WILLYS")).toBe("Groceries");
    expect(classify("SERVICENTRO EL CONEJO")).toBe("Loan on card · cash returned");
    expect(classify("PARKING GARAGE")).toBe("Parking");
    expect(classify("ANIBAL MARCOS PAZ")).toBe("Diving & activities");
    expect(classify("Martin Ackerman")).toBe("Friends & social");
    expect(classify("CAROLINA AFERGAN")).toBe("Friends & social");
    expect(classify("AUSOL")).toBe("Tolls & highways");
    expect(classify("SP SWEET-CHEMISTRY-SKI")).toBe("Work tests");
    expect(classify("HISPANO MEXICANO DE BU")).toBe("Diving & activities");
    expect(classify("Card charge (ANTARES DHANGETHI)")).toBe("Hotels");
    expect(classify("HKAIRWEB-USD2504062307273")).toBe("Flights");
    expect(classify("Card charge (Prismalink*IND VISAARR)")).toBe("Visas");
    expect(classify("Card charge (MYONGDONGYEBBEUMJOOEUB)")).toBe("Private health");
    expect(matchKnownMerchant("SP SWEET-CHEMISTRY-SKI")?.excludedFromTotals).toBe(true);
    expect(matchKnownMerchant("OPENAI *CHATGPT SUBSCR")?.recurrenceHint).toBe("monthly");
    expect(matchKnownMerchant("Card charge (GOOGLE *Google One)")?.recurrenceHint).toBe("annual");
    expect(matchKnownMerchant("APPLE.COM/BILL", { amount: "-9.49", currency: "USD" })?.displayName).toBe("YouTube (via Apple)");
    expect(matchKnownMerchant("APPLE.COM/BILL", { amount: "-0.99", currency: "USD" })?.displayName).toBe("iCloud (via Apple)");
    expect(matchKnownMerchant("APPLE.COM/BILL", { amount: "-12.99", currency: "USD" })).toBeNull();
    expect(matchKnownMerchant("APPLE.COM/BILL", { amount: "-9.49", currency: "USD" })?.beneficiaryScope).toBe("shared");
    expect(matchKnownMerchant("SANSA")?.reimbursementStatus).toBe("settled");
    expect(matchKnownMerchant("SANSA")?.excludedFromTotals).toBe(true);
    expect(matchKnownMerchant("SERVICENTRO EL CONEJO")?.reimbursementStatus).toBe("settled");
    expect(matchKnownMerchant("SERVICENTRO EL CONEJO")?.excludedFromTotals).toBe(true);
    expect(matchKnownMerchant("Juan Pablo Vaghi (company)")?.kind).toBe("income");
    expect(matchKnownMerchant("Jazak VeEmatz LL")?.categoryName).toBe("Papaya Kids");
    expect(matchKnownMerchant("Jazak VeEmatz LL")?.transactionLabel).toBe("Papaya Kids · Julian's company");
    expect(matchKnownMerchant("LONGXIANG KNITTING CO., LIMITED")?.categoryName).toBe("Papaya Kids");
    expect(matchKnownMerchant("Payment from GLOBAL ENCOUNTERS S.A")?.kind).toBe("income");
    expect(matchKnownMerchant("ATM withdrawal (020002395)")?.transactionLabel).toBe("Cash withdrawal");
    expect(matchKnownMerchant("Pablo Exequiel Buchholz")?.transactionLabel).toBe("Tattoo artist");
    expect(matchKnownMerchant("Baltodano Gomez Martin")?.categoryName).toBe("Satu Lagi Villa");
    expect(matchKnownMerchant("Baltodano Gomez Martin")?.excludedFromTotals).toBe(true);
    expect(matchKnownMerchant("Gutierrez Gonzalez Kaily Vanessa")?.categoryName).toBe("Satu Lagi Villa");
    expect(matchKnownMerchant("Uriel Daian")?.categoryName).toBe("Friends & social");
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
    expect(defaultExpenseCategories.some((category) => category.name === "Papaya Kids")).toBe(true);
    expect(defaultExpenseCategories.some((category) => category.name === "Loan on card · cash returned")).toBe(true);
  });

  it("turns negative known-provider transfers into spending but preserves positive refunds", () => {
    const psychologist = matchKnownMerchant("DANIEL JESICA SOLANGE");
    expect(resolvedKnownMerchantKind(psychologist, "-60000", "transfer")).toBe("expense");
    expect(resolvedKnownMerchantKind(psychologist, "60000", "refund")).toBe("refund");
    expect(resolvedKnownMerchantKind(matchKnownMerchant("Moved to DolarApp (ARQ)"), "-500", "unknown")).toBe("transfer");
    expect(resolvedKnownMerchantKind(matchKnownMerchant("Deel Balance"), "500", "unknown")).toBe("transfer");
    expect(resolvedKnownMerchantKind(matchKnownMerchant("Payment from Deel"), "500", "income")).toBe("transfer");
    expect(matchKnownMerchant("Payment to Julian Aaron Stivelman", { amount: "-60000", currency: "USD" })?.categoryName).toBe("Satu Lagi Villa");
    expect(matchKnownMerchant("Payment to Julian Aaron Stivelman", { amount: "-79", currency: "USD" })?.categoryName).not.toBe("Satu Lagi Villa");
  });
});
