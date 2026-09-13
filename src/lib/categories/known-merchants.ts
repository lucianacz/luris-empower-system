import { cleanDescription } from "@/lib/import/normalize";
import type { TransactionKind } from "@/lib/import/types";

export interface KnownMerchantRule {
  id: string;
  pattern: RegExp;
  displayName: string;
  preserveDisplayName?: boolean;
  categoryName: string | null;
  countryCode?: string;
  personRole?: string;
  recurrenceHint?: "weekly" | "monthly" | "annual";
  recurringStatus?: "active" | "inactive" | "uncertain";
  subscription?: boolean;
  recurrenceDenied?: boolean;
  seasonalMonthsPerYear?: number;
  beneficiaryScope?: "personal" | "shared";
  amount?: number;
  currency?: string;
  kind?: TransactionKind;
  excludedFromTotals?: boolean;
}

export interface KnownMerchantContext {
  amount?: string | number | null;
  currency?: string | null;
}

export function resolvedKnownMerchantKind(rule: KnownMerchantRule | null, amount: string, currentKind: TransactionKind): TransactionKind {
  if (rule?.kind) return rule.kind;
  if (rule?.categoryName && Number(amount) < 0) return "expense";
  return currentKind;
}

export const knownMerchantRules: KnownMerchantRule[] = [
  { id: "apple-youtube", pattern: /\bapple\.com\/bill\b/i, displayName: "YouTube (via Apple)", categoryName: "Subscriptions & software", recurrenceHint: "monthly", recurringStatus: "active", subscription: true, beneficiaryScope: "personal", amount: 9.49, currency: "USD" },
  { id: "apple-icloud", pattern: /\bapple\.com\/bill\b/i, displayName: "iCloud (via Apple)", categoryName: "Subscriptions & software", recurrenceHint: "monthly", recurringStatus: "active", subscription: true, beneficiaryScope: "personal", amount: 0.99, currency: "USD" },
  { id: "seven-eleven", pattern: /\b(?:7|seven)[ -]?eleven\b/i, displayName: "7-Eleven", categoryName: "Groceries", beneficiaryScope: "shared" },
  { id: "citymall", pattern: /\bcity\s*mall\b/i, displayName: "Citymall", categoryName: "Groceries", countryCode: "CR", beneficiaryScope: "shared" },
  { id: "golden-mall", pattern: /\bgolden\s*mall\b/i, displayName: "Golden Mall", categoryName: "Groceries", countryCode: "CR", beneficiaryScope: "shared" },
  { id: "jerusalem-panama", pattern: /\bjerusalem\s+de\s+panama\b/i, displayName: "Jerusalem de Panamá", categoryName: "Groceries", countryCode: "CR", beneficiaryScope: "shared" },
  { id: "daily-mart", pattern: /\bdaily\s*mart\b/i, displayName: "Daily Mart", categoryName: "Groceries", countryCode: "CR", beneficiaryScope: "shared" },
  { id: "bm-rio-claro", pattern: /\bbm\s+rio\s+claro\b/i, displayName: "BM Río Claro", categoryName: "Groceries", countryCode: "CR", beneficiaryScope: "shared" },
  { id: "supermarkets", pattern: /\b(?:mini\s*super|minisuper|mega\s*super|supermercado|supermarket|super)\b/i, displayName: "Supermarket", preserveDisplayName: true, categoryName: "Groceries", beneficiaryScope: "shared" },
  { id: "starbucks", pattern: /\bstarbucks?\b/i, displayName: "Starbucks", categoryName: "Dining out" },
  { id: "uber", pattern: /\buber\b(?!\s*(?:\*?\s*)?eats)/i, displayName: "Uber", categoryName: "Transport" },
  { id: "farmacity", pattern: /\bfarmacity\b/i, displayName: "Farmacity", categoryName: "Pharmacy" },
  { id: "stefanie-menajovsky", pattern: /\bstefanie\s+menajovsky\b/i, displayName: "Stefanie Menajovsky", categoryName: "Dentist", personRole: "Dentist" },
  { id: "esposito-maria-cecilia", pattern: /\besposito\s+maria\s+cecilia\b/i, displayName: "Esposito Maria Cecilia", categoryName: "Alternative therapy", personRole: "Biodecoder" },
  { id: "monk-augusto", pattern: /\bmonk\s+augusto\b/i, displayName: "Monk Augusto", categoryName: "English classes", personRole: "English teacher", recurrenceHint: "weekly" },
  { id: "daniel-jesica-solange", pattern: /\bdaniel\s+jesica\s+solange\b/i, displayName: "Daniel Jesica Solange", categoryName: "Therapy", personRole: "Psychologist", recurrenceHint: "weekly", beneficiaryScope: "personal" },
  { id: "anibal-marcos-paz", pattern: /\banibal\s+marcos\s+paz\b/i, displayName: "Anibal Marcos Paz", categoryName: "Diving & activities", personRole: "Surfboard workshop", beneficiaryScope: "personal" },
  { id: "fraiman-karina-andrea", pattern: /\bfraiman\s+karina\s+andrea\b/i, displayName: "Fraiman Karina Andrea", categoryName: "Workshops & classes", personRole: "Women's workshop", beneficiaryScope: "personal" },
  { id: "esteban-leisa-dermatology", pattern: /\besteban\s+tomas\s+halac\b|\bleisa\s+maria\s+molinari\b/i, displayName: "Skin medical center", categoryName: "Dermatology", personRole: "Skin medical center", beneficiaryScope: "personal" },
  { id: "nely-nardy-vargas-castro", pattern: /\bnely\s+nardy\s+vargas\s+castro\b/i, displayName: "Nely Nardy Vargas Castro", categoryName: "Cleaning", countryCode: "CR", personRole: "Cleaner" },
  { id: "cara-goldberg", pattern: /\bcara\s+goldberg\b/i, displayName: "Casa Costa Rica · Cara Goldberg", categoryName: "Housing", countryCode: "CR", personRole: "Landlord", recurrenceHint: "monthly", recurringStatus: "uncertain", seasonalMonthsPerYear: 6, beneficiaryScope: "shared" },
  { id: "airbnb", pattern: /\bairbnb\b/i, displayName: "Airbnb", categoryName: "Housing", beneficiaryScope: "shared" },
  { id: "fuel-costa-rica", pattern: /\blumicentro\b|\bservicentro\b|\bgas\s+station\b/i, displayName: "Gas station", preserveDisplayName: true, categoryName: "Fuel & gas", countryCode: "CR", beneficiaryScope: "shared" },
  { id: "casa-hyundai", pattern: /\bla\s+casa\s+del\s+hyundai\b/i, displayName: "La Casa del Hyundai", categoryName: "Car repairs" },
  { id: "centro-llantero", pattern: /\bcentro\s+llantero\s+del\s+sur\b/i, displayName: "Centro Llantero del Sur", categoryName: "Car repairs", countryCode: "CR" },
  { id: "sephora", pattern: /\bsephora\b/i, displayName: "Sephora", categoryName: "Personal care" },
  { id: "enterprise", pattern: /\benterprise\b/i, displayName: "Enterprise", categoryName: "Car rental" },
  { id: "anthropic-claude", pattern: /\banthropic\*?\s*claude\s+sub\b|\bclaude\.ai\s+subscription\b/i, displayName: "Claude", categoryName: "Subscriptions & software", recurrenceHint: "monthly", recurringStatus: "active", subscription: true, beneficiaryScope: "personal" },
  { id: "openai-chatgpt", pattern: /\bopenai\s*\*?\s*chatgpt\s+subscr\b|\bchatgpt\s+subscription\b/i, displayName: "ChatGPT", categoryName: "Subscriptions & software", recurrenceHint: "monthly", recurringStatus: "active", subscription: true, beneficiaryScope: "personal" },
  { id: "google-one", pattern: /\bgoogle\s*\*?\s*google\s+one\b|\bgoogle\s+one\b/i, displayName: "Google One", categoryName: "Subscriptions & software", recurrenceHint: "annual", recurringStatus: "active", subscription: true, beneficiaryScope: "personal" },
  { id: "martin-ackerman", pattern: /\bmartin\s+ackerman\b/i, displayName: "Martin Ackerman", categoryName: "Friends & social", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "carolina-afergan", pattern: /\bcarolina\s+afergan\b/i, displayName: "Carolina Afergan", categoryName: "Friends & social", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "nicole-aronson", pattern: /\bnicole\s+aronson\b/i, displayName: "Nicole Aronson", categoryName: "Friends & social", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "tatiana-fluk", pattern: /\btatiana\s+fluk\b/i, displayName: "Tatiana Fluk", categoryName: "Friends & social", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "ausol", pattern: /\bausol\b/i, displayName: "AUSOL", categoryName: "Tolls & highways", countryCode: "AR", recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "sweet-chemistry-work-test", pattern: /\bsp\s+sweet[ -]?chemistry[ -]?ski\b/i, displayName: "Shopify work test · Sweet Chemistry", categoryName: "Work tests", recurrenceDenied: true, beneficiaryScope: "personal", excludedFromTotals: true },
  { id: "not-subscription-ato-sjo", pattern: /\b24\/7\s+ato\s+sjo\b/i, displayName: "24/7 ATO SJO", categoryName: null, recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "not-subscription-ztl", pattern: /\bztl\*?operadoradefranqui\b/i, displayName: "ZTL Operadora de Franqui", categoryName: null, recurrenceDenied: true, beneficiaryScope: "personal" },
  { id: "owned-account", pattern: /\bde una cuenta tuya\b/i, displayName: "Owned-account transfer", categoryName: null, kind: "transfer", excludedFromTotals: true },
  { id: "deel-to-arq", pattern: /\b(?:moved|withdrawal|transfer(?:red)?)\s+to\s+(?:dolarapp+|arq)\b|\bdolarapp+\s*\(?arq\)?\b/i, displayName: "Deel to ARQ", categoryName: null, kind: "transfer", excludedFromTotals: true },
];

export function matchKnownMerchant(value: string, context: KnownMerchantContext = {}): KnownMerchantRule | null {
  const description = cleanDescription(value);
  return knownMerchantRules.find((rule) => {
    if (!rule.pattern.test(description)) return false;
    if (rule.currency && rule.currency !== context.currency?.toUpperCase()) return false;
    if (rule.amount !== undefined) {
      const amount = Math.abs(Number(context.amount));
      if (!Number.isFinite(amount) || Math.abs(amount - rule.amount) > 0.001) return false;
    }
    return true;
  }) ?? null;
}

export function resolvedKnownMerchantName(rule: KnownMerchantRule | null, description: string) {
  return rule?.preserveDisplayName ? cleanDescription(description) : rule?.displayName ?? cleanDescription(description);
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
    "Car",
    "Car rental",
    "Car repairs",
    "Dining out",
    "Diving & activities",
    "Entertainment",
    "Flights",
    "Groceries",
    "Hotels",
    "Housing",
    "Fuel & gas",
    "Friends & social",
    "Personal care",
    "Parking",
    "Pharmacy",
    "Shopping",
    "Transport",
    "Tolls & highways",
    "Travel",
  ].includes(categoryName ?? "");
}
