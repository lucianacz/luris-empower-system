export type BeneficiaryScope = "personal" | "shared" | "partner" | "other";

export function hasManualBeneficiaryScope(metadata: Record<string, unknown> | null | undefined) {
  return metadata?.beneficiaryScopeSource === "manual";
}

export function withManualBeneficiaryScope(metadata: Record<string, unknown> | null | undefined, scope: BeneficiaryScope) {
  return {
    ...(metadata ?? {}),
    beneficiaryScopeSource: "manual",
    beneficiaryScope: scope,
    beneficiaryScopeUpdatedAt: new Date().toISOString(),
  };
}

export function isCostaRicaHouseholdFood(input: { categoryName: string | null; locationCountry: string | null; merchantCountry: string | null; originalCurrency: string }) {
  const hasCostaRicaEvidence = input.locationCountry === "CR" || input.merchantCountry === "CR" || input.originalCurrency.toUpperCase() === "CRC";
  return hasCostaRicaEvidence && ["Dining out", "Groceries"].includes(input.categoryName ?? "");
}
