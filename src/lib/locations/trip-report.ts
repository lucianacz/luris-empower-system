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

export function transactionIdsForLocationPeriod(period: WorkspaceLocationPeriod, transactions: WorkspaceTransaction[], asOfDate: string, equivalentPeriodIds: Iterable<string> = [period.id]) {
  const periodIds = new Set(equivalentPeriodIds);
  return transactions.filter((transaction) => {
    if (isLocationIndependentCategory(effectiveCategoryName(transaction))) return false;
    if (transaction.location_period?.id && periodIds.has(transaction.location_period.id)) return true;
    if (!transaction.travel_date || !destinationMatchesPeriod(transaction.travel_destination, period)) return false;
    return transaction.travel_date >= period.starts_on && transaction.travel_date <= (period.ends_on || asOfDate);
  }).map((transaction) => transaction.id);
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
