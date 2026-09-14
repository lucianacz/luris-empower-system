import { describe, expect, it } from "vitest";
import { hasManualBeneficiaryScope, isCostaRicaHouseholdFood, withManualBeneficiaryScope } from "./beneficiary-scope";

describe("manual personal/shared classification", () => {
  it("marks the scope as a user decision while preserving transaction metadata", () => {
    const metadata = withManualBeneficiaryScope({ source: "statement" }, "shared");

    expect(metadata).toMatchObject({ source: "statement", beneficiaryScopeSource: "manual", beneficiaryScope: "shared" });
    expect(hasManualBeneficiaryScope(metadata)).toBe(true);
  });

  it("treats both Costa Rica restaurants and groceries as household spending", () => {
    expect(isCostaRicaHouseholdFood({ categoryName: "Dining out", locationCountry: "CR", merchantCountry: null, originalCurrency: "USD" })).toBe(true);
    expect(isCostaRicaHouseholdFood({ categoryName: "Groceries", locationCountry: null, merchantCountry: null, originalCurrency: "CRC" })).toBe(true);
    expect(isCostaRicaHouseholdFood({ categoryName: "Therapy", locationCountry: "CR", merchantCountry: "CR", originalCurrency: "CRC" })).toBe(false);
  });
});
