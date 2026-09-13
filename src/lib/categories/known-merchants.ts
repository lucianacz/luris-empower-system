import { cleanDescription } from "@/lib/import/normalize";
import type { TransactionKind } from "@/lib/import/types";

export interface KnownMerchantRule {
  id: string;
  pattern: RegExp;
  displayName: string;
  categoryName: string | null;
  countryCode?: string;
  personRole?: string;
  recurrenceHint?: "weekly" | "monthly";
  kind?: TransactionKind;
  excludedFromTotals?: boolean;
}

export function resolvedKnownMerchantKind(rule: KnownMerchantRule | null, amount: string, currentKind: TransactionKind): TransactionKind {
  if (rule?.kind) return rule.kind;
  if (rule?.categoryName && Number(amount) < 0) return "expense";
  return currentKind;
}

export const knownMerchantRules: KnownMerchantRule[] = [
  { id: "seven-eleven", pattern: /\b(?:7|seven)[ -]?eleven\b/i, displayName: "7-Eleven", categoryName: "Groceries" },
  { id: "citymall", pattern: /\bcity\s*mall\b/i, displayName: "Citymall", categoryName: "Groceries" },
  { id: "starbucks", pattern: /\bstarbucks?\b/i, displayName: "Starbucks", categoryName: "Dining out" },
  { id: "uber", pattern: /\buber\b(?!\s*(?:\*?\s*)?eats)/i, displayName: "Uber", categoryName: "Transport" },
  { id: "farmacity", pattern: /\bfarmacity\b/i, displayName: "Farmacity", categoryName: "Pharmacy" },
  { id: "stefanie-menajovsky", pattern: /\bstefanie\s+menajovsky\b/i, displayName: "Stefanie Menajovsky", categoryName: "Dentist", personRole: "Dentist" },
  { id: "esposito-maria-cecilia", pattern: /\besposito\s+maria\s+cecilia\b/i, displayName: "Esposito Maria Cecilia", categoryName: "Alternative therapy", personRole: "Biodecoder" },
  { id: "monk-augusto", pattern: /\bmonk\s+augusto\b/i, displayName: "Monk Augusto", categoryName: "English classes", personRole: "English teacher", recurrenceHint: "weekly" },
  { id: "daniel-jesica-solange", pattern: /\bdaniel\s+jesica\s+solange\b/i, displayName: "Daniel Jesica Solange", categoryName: "Therapy", personRole: "Psychologist", recurrenceHint: "weekly" },
  { id: "nely-nardy-vargas-castro", pattern: /\bnely\s+nardy\s+vargas\s+castro\b/i, displayName: "Nely Nardy Vargas Castro", categoryName: "Cleaning", countryCode: "CR", personRole: "Cleaner" },
  { id: "cara-goldberg", pattern: /\bcara\s+goldberg\b/i, displayName: "Cara Goldberg", categoryName: "Housing", countryCode: "CR", personRole: "Landlord", recurrenceHint: "monthly" },
  { id: "casa-hyundai", pattern: /\bla\s+casa\s+del\s+hyundai\b/i, displayName: "La Casa del Hyundai", categoryName: "Car repairs" },
  { id: "centro-llantero", pattern: /\bcentro\s+llantero\s+del\s+sur\b/i, displayName: "Centro Llantero del Sur", categoryName: "Car repairs", countryCode: "CR" },
  { id: "sephora", pattern: /\bsephora\b/i, displayName: "Sephora", categoryName: "Personal care" },
  { id: "enterprise", pattern: /\benterprise\b/i, displayName: "Enterprise", categoryName: "Car rental" },
  { id: "owned-account", pattern: /\bde una cuenta tuya\b/i, displayName: "Owned-account transfer", categoryName: null, kind: "transfer", excludedFromTotals: true },
  { id: "deel-to-arq", pattern: /\b(?:moved|withdrawal|transfer(?:red)?)\s+to\s+(?:dolarapp+|arq)\b|\bdolarapp+\s*\(?arq\)?\b/i, displayName: "Deel to ARQ", categoryName: null, kind: "transfer", excludedFromTotals: true },
];

export function matchKnownMerchant(value: string): KnownMerchantRule | null {
  const description = cleanDescription(value);
  return knownMerchantRules.find((rule) => rule.pattern.test(description)) ?? null;
}

export function normalizeUserCountryHint(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toUpperCase();
  if (["PA", "PAN", "PANAMA", "PANAMÁ"].includes(normalized)) return "CR";
  if (["CRI", "COSTA RICA"].includes(normalized)) return "CR";
  if (["ARG", "ARGENTINA"].includes(normalized)) return "AR";
  if (["MEX", "MEXICO", "MÉXICO"].includes(normalized)) return "MX";
  if (["USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(normalized)) return "US";
  return normalized;
}

export function isEverydayVariableCategory(categoryName: string | null | undefined): boolean {
  return [
    "Car rental",
    "Car repairs",
    "Dining out",
    "Entertainment",
    "Flights",
    "Groceries",
    "Hotels",
    "Personal care",
    "Pharmacy",
    "Shopping",
    "Transport",
    "Travel",
  ].includes(categoryName ?? "");
}
