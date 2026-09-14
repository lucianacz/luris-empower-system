import { isLocationIndependentCategory } from "@/lib/locations/attribution";
import { suggestDefaultCategory } from "@/lib/categories/defaults";
import { buildSpendingReport, type SpendingReport } from "@/lib/reporting/report";
import type { WorkspaceLocationPeriod, WorkspaceTransaction } from "@/lib/workspace/demo";

export interface TripExpenseReport {
  period: WorkspaceLocationPeriod;
  report: SpendingReport;
}

export function isTripPeriod(period: WorkspaceLocationPeriod) {
  return period.status === "confirmed" && (period.period_type === "temporary_stay" || Boolean(period.trip_purpose));
}

export function groupEquivalentTripPeriods(periods: WorkspaceLocationPeriod[], combineProfiles: boolean) {
  if (!combineProfiles) return periods.map((period) => [period]);
  const groups = new Map<string, WorkspaceLocationPeriod[]>();
  for (const period of periods) {
    const purpose = period.trip_purpose?.toLowerCase() ?? "";
    const explicitlyIndividual = /\bpersonal\b|\bsolo\b|\bwork\b/.test(purpose);
    const ownerKey = explicitlyIndividual ? period.person_id || period.person?.id || period.person?.role || "individual" : "together";
    const key = [period.location.country_code || period.location.country_name || period.location.name, period.starts_on, period.ends_on || "ongoing", ownerKey].join(":");
    groups.set(key, [...(groups.get(key) ?? []), period]);
  }
  return [...groups.values()];
}

export function isSharedTripGroup(periods: WorkspaceLocationPeriod[]) {
  const people = new Set(periods.map((period) => period.person_id || period.person?.id).filter(Boolean));
  return people.size > 1 || periods.some((period) => /\bshared\b|\bhousehold\b|\bcouple\b|\bpareja\b/i.test(period.trip_purpose ?? ""));
}

export function transactionIdsForLocationPeriod(period: WorkspaceLocationPeriod, transactions: WorkspaceTransaction[], asOfDate: string, equivalentPeriodIds: Iterable<string> = [period.id]) {
  const periodIds = new Set(equivalentPeriodIds);
  return transactions.filter((transaction) => {
    const categoryName = effectiveCategoryName(transaction);
    if (isLocationIndependentCategory(categoryName)) return false;
    if (isFixedLocationExpenseElsewhere(transaction, period, categoryName)) return false;
    if (transaction.location_period?.id && periodIds.has(transaction.location_period.id)) return true;
    if (!transaction.travel_date || !destinationMatchesPeriod(transaction.travel_destination, period)) return false;
    return transaction.travel_date >= period.starts_on && transaction.travel_date <= (period.ends_on || asOfDate);
  }).map((transaction) => transaction.id);
}

function isFixedLocationExpenseElsewhere(transaction: WorkspaceTransaction, period: WorkspaceLocationPeriod, categoryName: string | null) {
  if (!["Housing", "Cleaning", "Bills & utilities"].includes(categoryName ?? "")) return false;
  const expenseCountry = transaction.merchant_country?.toUpperCase();
  const tripCountry = period.location.country_code?.toUpperCase();
  return Boolean(expenseCountry && tripCountry && expenseCountry !== tripCountry);
}

export function buildTripExpenseReport(period: WorkspaceLocationPeriod, transactions: WorkspaceTransaction[], asOfDate: string, equivalentPeriodIds: Iterable<string> = [period.id]): TripExpenseReport {
  const transactionIds = new Set(transactionIdsForLocationPeriod(period, transactions, asOfDate, equivalentPeriodIds));
  const rows = transactions.filter((transaction) => transactionIds.has(transaction.id));
  const dates = rows.map((transaction) => transaction.occurred_at.slice(0, 10)).sort();
  const range = {
    from: dates[0] ?? period.starts_on,
    to: dates.at(-1) ?? period.ends_on ?? asOfDate,
  };

  return { period, report: buildSpendingReport(rows, range, asOfDate) };
}

function effectiveCategoryName(transaction: WorkspaceTransaction) {
  if (transaction.category?.name) return transaction.category.name;
  return suggestDefaultCategory({
    kind: transaction.kind as "expense",
    description: transaction.description,
    metadata: Object.fromEntries(Object.entries(transaction.metadata ?? {}).filter((entry): entry is [string, string | number | boolean | null] => entry[1] === null || ["string", "number", "boolean"].includes(typeof entry[1]))),
    amount: transaction.amount,
    currency: transaction.currency,
  });
}

function destinationMatchesPeriod(destination: string | null | undefined, period: WorkspaceLocationPeriod) {
  const normalized = destination?.trim().toUpperCase();
  if (!normalized) return false;
  return [period.location.country_code, period.location.country_name, period.location.name].some((value) => value?.trim().toUpperCase() === normalized);
}
