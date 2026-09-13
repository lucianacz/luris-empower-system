import type { WorkspaceLocationPeriod, WorkspaceTransaction } from "@/lib/workspace/demo";

export interface LocationSuggestion {
  key: string;
  countryCode: string;
  countryName: string;
  startsOn: string;
  endsOn: string;
  confidence: number;
  explanation: string;
  transactionIds: string[];
  evidence: { merchantCountrySignals: number; currencySignals: number; distinctDays: number; housingSignals: number; flightDestinationSignals: number; previousLocationSignals: number };
}

export interface LearnedCurrencyHint { currency: string; countryCode: string; countryName: string; weight?: number }

const currencyHints: Record<string, { code: string; name: string }> = {
  ARS: { code: "AR", name: "Argentina" }, BRL: { code: "BR", name: "Brazil" }, CRC: { code: "CR", name: "Costa Rica" },
  MXN: { code: "MX", name: "Mexico" }, CLP: { code: "CL", name: "Chile" }, COP: { code: "CO", name: "Colombia" },
  PEN: { code: "PE", name: "Peru" }, UYU: { code: "UY", name: "Uruguay" }, JPY: { code: "JP", name: "Japan" },
  KRW: { code: "KR", name: "South Korea" }, THB: { code: "TH", name: "Thailand" },
};

export function inferLocationSuggestions(transactions: WorkspaceTransaction[], confirmed: WorkspaceLocationPeriod[] = [], learnedHints: LearnedCurrencyHint[] = []): LocationSuggestion[] {
  const availableHints = { ...currencyHints, ...Object.fromEntries(learnedHints.map((hint) => [hint.currency.toUpperCase(), { code: hint.countryCode.toUpperCase(), name: hint.countryName }])) };
  const signals = new Map<string, Signal[]>();
  for (const transaction of transactions) {
    if (transaction.status !== "posted" || transaction.excluded_from_totals || !["expense", "refund"].includes(transaction.kind)) continue;
    if (isFlight(transaction)) {
      const destination = transaction.travel_destination ? normalizeCountry(transaction.travel_destination, availableHints) : null;
      if (destination) {
        const signal: Signal = { transactionId: transaction.id, date: (transaction.travel_date || transaction.occurred_at).slice(0, 10), countryCode: destination.code, countryName: destination.name, source: "flight_destination", housing: false };
        signals.set(destination.code, [...(signals.get(destination.code) ?? []), signal]);
      }
      continue;
    }
    const country = countrySignal(transaction, availableHints);
    if (!country) continue;
    const signal: Signal = { transactionId: transaction.id, date: transaction.occurred_at.slice(0, 10), countryCode: country.code, countryName: country.name, source: country.source, housing: /airbnb|rent|alquiler|hotel|housing/i.test(`${transaction.description} ${transaction.category?.name ?? ""}`) };
    signals.set(country.code, [...(signals.get(country.code) ?? []), signal]);
  }

  return [...signals.values()].flatMap((items) => clusterSignals(items, confirmed)).filter((suggestion) => !confirmed.some((period) => period.status !== "suggested" && period.location.country_code === suggestion.countryCode && overlaps(period.starts_on, period.ends_on, suggestion.startsOn, suggestion.endsOn))).sort((left, right) => left.startsOn.localeCompare(right.startsOn));
}

interface Signal { transactionId: string; date: string; countryCode: string; countryName: string; source: "merchant_country" | "currency" | "flight_destination"; housing: boolean }

function countrySignal(transaction: WorkspaceTransaction, availableHints: typeof currencyHints) {
  const raw = transaction.merchant_country || stringMetadata(transaction.metadata?.merchantCountry);
  if (raw) {
    const normalized = raw.trim().toUpperCase();
    const code = normalized.length === 2 ? normalized : countryCodeFromName(normalized, availableHints);
    return { code, name: displayCountry(code, raw), source: "merchant_country" as const };
  }
  const hint = availableHints[transaction.original_currency || transaction.currency];
  return hint ? { ...hint, source: "currency" as const } : null;
}

function clusterSignals(items: Signal[], confirmed: WorkspaceLocationPeriod[]) {
  const sorted = [...items].sort((left, right) => left.date.localeCompare(right.date));
  const clusters: Signal[][] = [];
  for (const item of sorted) {
    const active = clusters.at(-1);
    if (!active || daysBetween(active.at(-1)!.date, item.date) > 21) clusters.push([item]);
    else active.push(item);
  }
  return clusters.flatMap((cluster) => {
    const local = cluster.filter((signal) => signal.source !== "flight_destination");
    const days = new Set(local.map((signal) => signal.date));
    const merchantCountrySignals = cluster.filter((signal) => signal.source === "merchant_country").length;
    const currencySignals = cluster.filter((signal) => signal.source === "currency").length;
    const flightDestinationSignals = cluster.filter((signal) => signal.source === "flight_destination").length;
    const housingSignals = cluster.filter((signal) => signal.housing).length;
    if (local.length < 4 || days.size < 3) return [];
    const first = local[0];
    const startsOn = first.date;
    const endsOn = local.at(-1)!.date;
    const previousLocationSignals = confirmed.filter((period) => period.status === "confirmed" && period.location.country_code === first.countryCode && period.ends_on && period.ends_on < startsOn && daysBetween(period.ends_on, startsOn) <= 45).length;
    let confidence = 0.28 + Math.min(merchantCountrySignals * 0.1, 0.45) + Math.min(currencySignals * 0.035, 0.18) + Math.min(days.size * 0.035, 0.18) + Math.min(housingSignals * 0.08, 0.16) + Math.min(flightDestinationSignals * 0.04, 0.08) + Math.min(previousLocationSignals * 0.07, 0.14);
    if (!merchantCountrySignals) confidence = Math.min(confidence, 0.6);
    const parts = [`${local.length} local transactions across ${days.size} days`];
    if (merchantCountrySignals) parts.push(`${merchantCountrySignals} merchant-country signals`);
    if (currencySignals) parts.push(`${currencySignals} currency clues`);
    if (housingSignals) parts.push(`${housingSignals} housing or lodging payment${housingSignals === 1 ? "" : "s"}`);
    if (flightDestinationSignals) parts.push(`${flightDestinationSignals} matching flight-destination clue${flightDestinationSignals === 1 ? "" : "s"}`);
    if (previousLocationSignals) parts.push("a nearby previously confirmed period");
    return [{ key: `${first.countryCode}:${startsOn}:${endsOn}`, countryCode: first.countryCode, countryName: first.countryName, startsOn, endsOn, confidence: Number(Math.min(confidence, 0.98).toFixed(2)), explanation: `${parts.join(", ")}. Currency and flights are treated only as supporting evidence.`, transactionIds: [...new Set(cluster.map((signal) => signal.transactionId))], evidence: { merchantCountrySignals, currencySignals, distinctDays: days.size, housingSignals, flightDestinationSignals, previousLocationSignals } }];
  });
}

function isFlight(transaction: WorkspaceTransaction) { return Boolean(transaction.travel_destination) || /airline|aeroline|avianca|latam|lan airline|copa air|vivaaerobus|sansa|air transport/i.test(`${transaction.description} ${transaction.category?.name ?? ""}`); }
function normalizeCountry(value: string, availableHints: typeof currencyHints) { const normalized = value.trim().toUpperCase(); const code = normalized.length === 2 ? normalized : countryCodeFromName(normalized, availableHints); return code.length === 2 ? { code, name: displayCountry(code, value) } : null; }

function overlaps(leftStart: string, leftEnd: string | null, rightStart: string, rightEnd: string) { return leftStart <= rightEnd && (leftEnd ?? "9999-12-31") >= rightStart; }
function daysBetween(left: string, right: string) { return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86_400_000); }
function displayCountry(code: string, fallback: string) { try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || fallback; } catch { return fallback; } }
function countryCodeFromName(value: string, availableHints: typeof currencyHints) { return Object.values(availableHints).find((country) => country.name.toUpperCase() === value)?.code ?? value.slice(0, 2); }
function stringMetadata(value: unknown) { return typeof value === "string" ? value : null; }
