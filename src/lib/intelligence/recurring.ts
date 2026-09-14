import Decimal from "decimal.js";
import { isEverydayVariableCategory, matchKnownMerchant } from "@/lib/categories/known-merchants";
import { canonicalMerchant } from "@/lib/reporting/report";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";

export interface RecurringPattern {
  key: string;
  merchantKey: string;
  ownerPersonId: string | null;
  ownerName: string | null;
  ownerRole: string | null;
  providerName: string;
  frequency: "weekly" | "monthly" | "annual" | "uncertain";
  status: "active" | "inactive" | "uncertain";
  currency: string;
  medianAmount: number;
  latestAmount: number;
  lastPayment: string;
  expectedNextPayment: string | null;
  transactionIds: string[];
  missingMonths: string[];
  doubledTransactionIds: string[];
  categoryName: string | null;
  isSubscription: boolean;
  seasonalMonthsPerYear: number | null;
  scheduleNote: string | null;
}

export interface IntelligenceQuestion {
  key: string;
  type: string;
  prompt: string;
  explanation: string;
  priority: number;
  transactionIds: string[];
  merchantKey: string;
}

export interface SpendingInsight {
  key: string;
  title: string;
  body: string;
  priority: number;
  transactionIds: string[];
}

export function analyzeRecurring(transactions: WorkspaceTransaction[], today: string) {
  const groups = new Map<string, WorkspaceTransaction[]>();
  for (const transaction of transactions) {
    if (transaction.metadata?.isDuplicate === true || transaction.status !== "posted" || transaction.excluded_from_totals || !["expense", "fee", "tax"].includes(transaction.kind) || new Decimal(transaction.amount || 0).isPositive()) continue;
    const merchantKey = transaction.merchant_key || canonicalMerchant(transaction.merchant_name || transaction.description);
    const ownerKey = transaction.account_owner?.id ?? transaction.paid_by?.id ?? transaction.account_owner?.role ?? transaction.paid_by?.role ?? null;
    const key = ownerKey ? `${merchantKey}::${ownerKey}` : merchantKey;
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  const patterns: RecurringPattern[] = [];
  const questions: IntelligenceQuestion[] = [];
  const insights: SpendingInsight[] = [];
  for (const [key, rows] of groups) {
    const sorted = [...rows].sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
    const latest = sorted.at(-1)!;
    const merchantKey = latest.merchant_key || canonicalMerchant(latest.merchant_name || latest.description);
    const known = matchKnownMerchant(latest.description, latest) ?? matchKnownMerchant(latest.merchant_name || "", latest);
    if (known?.recurrenceDenied) continue;
    if (rows.length < 2 && !(known?.subscription && known.recurrenceHint)) continue;
    const dates = sorted.map((row) => row.occurred_at.slice(0, 10));
    const gaps = dates.slice(1).map((date, index) => daysBetween(dates[index], date));
    const medianGap = median(gaps);
    const categoryName = mostCommon(sorted.map((row) => row.category?.name).filter((value): value is string => Boolean(value))) ?? null;
    const distinctMonths = new Set(dates.map((date) => date.slice(0, 7))).size;
    const explicitlyMonthly = /hospital\s*alem[aá]n|hospitalaleman/i.test(`${merchantKey} ${sorted.at(-1)!.description}`);
    const thisMonthRows = sorted.filter((row) => row.occurred_at.startsWith(today.slice(0, 7)));
    if (categoryName === "Dining out" && thisMonthRows.length >= 3) insights.push({ key: `restaurant-visits:${key}:${today.slice(0, 7)}`, title: `${thisMonthRows.length} visits to ${known?.displayName ?? sorted.at(-1)!.merchant_name ?? sorted.at(-1)!.description} this month`, body: `Open the ${thisMonthRows.length} supporting restaurant transactions.`, priority: 55, transactionIds: thisMonthRows.map((row) => row.id) });

    if (isEverydayVariableCategory(categoryName ?? known?.categoryName) && !known?.recurrenceHint) continue;
    const annual = known?.recurrenceHint === "annual" || rows.length >= 2 && medianGap >= 320 && medianGap <= 410;
    const weekly = rows.length >= 6 && distinctMonths >= 3 && medianGap >= 5 && medianGap <= 10;
    const monthly = explicitlyMonthly || known?.recurrenceHint === "monthly" || (distinctMonths >= 3 && looksMonthly(dates, gaps));
    const frequency = annual ? "annual" : weekly || (known?.recurrenceHint === "weekly" && rows.length >= 4) ? "weekly" : monthly ? "monthly" : "uncertain";
    if (frequency === "uncertain") continue;
    const amounts = sorted.map((row) => Math.abs(Number(row.amount)));
    const baselineRows = known?.confirmedPlanChangeOn
      ? sorted.filter((row) => row.occurred_at.slice(0, 10) >= known.confirmedPlanChangeOn!)
      : sorted;
    const comparisonRows = baselineRows.length ? baselineRows : sorted;
    const baselineAmounts = comparisonRows.map((row) => Math.abs(Number(row.amount)));
    const medianAmount = median(baselineAmounts);
    const lastPayment = dates.at(-1)!;
    const expectedDays = frequency === "weekly" ? 7 : frequency === "monthly" ? 30 : frequency === "annual" ? 365 : null;
    const staleDays = daysBetween(lastPayment, today);
    const seasonalMonthsPerYear = known?.seasonalMonthsPerYear ?? null;
    const status = seasonalMonthsPerYear ? "uncertain" : known?.recurringStatus ?? (expectedDays == null ? "uncertain" : staleDays <= expectedDays * 1.8 ? "active" : staleDays > expectedDays * 3 ? "inactive" : "uncertain");
    const expectedNextPayment = seasonalMonthsPerYear || known?.paidByPartner || expectedDays == null ? null : addDays(lastPayment, expectedDays);
    const doubled = seasonalMonthsPerYear ? [] : comparisonRows.filter((row) => (row.expense_allocations?.length ?? 0) < 2 && Math.abs(Number(row.amount)) >= medianAmount * 1.75 && medianAmount > 0).map((row) => row.id);
    const ignoredMissingMonths = new Set(known?.ignoredMissingMonths ?? []);
    const allocatedMonths = new Set(sorted.flatMap((row) => row.expense_allocations ?? []).map((allocation) => allocation.service_month.slice(0, 7)));
    const missingMonths = frequency === "monthly" && !seasonalMonthsPerYear && !known?.paidByPartner ? findMissingMonths(dates).filter((month) => !ignoredMissingMonths.has(month) && !allocatedMonths.has(month)) : [];
    const validDuplicateMonths = new Set(known?.validDuplicateMonths ?? []);
    const duplicateMonths = frequency === "monthly" && !seasonalMonthsPerYear ? [...new Set(dates.map((date) => date.slice(0, 7)).filter((month, index, months) => months.indexOf(month) !== index && !validDuplicateMonths.has(month)))] : [];
    const previousAmount = baselineAmounts.at(-2) ?? baselineAmounts.at(-1)!;
    const latestIncrease = baselineAmounts.length >= 2 && previousAmount > 0 ? baselineAmounts.at(-1)! / previousAmount - 1 : 0;
    const latestGap = gaps.at(-1) ?? expectedDays;
    const isSubscription = known?.subscription === true || categoryName === "Subscriptions & software" || !categoryName && ["monthly", "annual"].includes(frequency) && coefficientOfVariation(amounts) < 0.05;
    const scheduleNote = known?.paidByPartner
      ? "Shared service · paid by partner; months without a charge in your accounts are not missing payments"
      : seasonalMonthsPerYear
        ? `Seasonal housing · around ${seasonalMonthsPerYear} months per year`
        : known?.confirmedPlanChangeOn
          ? `Current price baseline starts ${known.confirmedPlanChangeOn}`
          : null;
    const owner = latest.account_owner ?? latest.paid_by ?? null;
    const pattern: RecurringPattern = { key, merchantKey, ownerPersonId: owner?.id ?? null, ownerName: owner?.display_name ?? null, ownerRole: owner?.role ?? null, providerName: known?.displayName ?? (sorted.at(-1)!.merchant_name || sorted.at(-1)!.description), frequency, status, currency: sorted.at(-1)!.currency, medianAmount, latestAmount: amounts.at(-1)!, lastPayment, expectedNextPayment, transactionIds: sorted.map((row) => row.id), missingMonths, doubledTransactionIds: doubled, categoryName, isSubscription, seasonalMonthsPerYear, scheduleNote };
    patterns.push(pattern);

    const ownerDetail = pattern.ownerName ? ` These payments belong to ${pattern.ownerName}'s own billing cycle.` : "";
    if (!categoryName) questions.push({ key: `recurring-category:${key}`, type: "recurring_unidentified", prompt: `You paid ${pattern.providerName} ${rows.length} times. What is this expense?`, explanation: `${capitalize(frequency)} payments are around ${pattern.currency} ${medianAmount.toFixed(2)}.${ownerDetail}`, priority: Math.min(95, 55 + rows.length * 3), transactionIds: pattern.transactionIds, merchantKey });
    if (missingMonths.length) questions.push({ key: `recurring-missing:${key}:${missingMonths.at(-1)}`, type: "recurring_missing_month", prompt: `No ${pattern.providerName} payment was found in ${formatMonth(missingMonths.at(-1)!)}. Did another payment cover it?`, explanation: `This provider otherwise appears ${frequency}. The evidence includes ${rows.length} payments.${ownerDetail}`, priority: 85, transactionIds: pattern.transactionIds, merchantKey });
    if (frequency === "monthly" && doubled.length) questions.push({ key: `recurring-double:${key}:${doubled.at(-1)}`, type: "possible_multi_period_payment", prompt: `A ${pattern.providerName} payment is approximately twice its usual amount. Does it cover more than one service month?`, explanation: `Typical payment: ${pattern.currency} ${medianAmount.toFixed(2)}.${ownerDetail}`, priority: 92, transactionIds: unique([...pattern.transactionIds.slice(-4), ...doubled]), merchantKey });
    if (duplicateMonths.length) questions.push({ key: `recurring-two-payments:${key}:${duplicateMonths.at(-1)}`, type: "recurring_two_payments", prompt: `Two ${pattern.providerName} payments appear in ${formatMonth(duplicateMonths.at(-1)!)}. Are both valid charges?`, explanation: `Both payments belong to the same person's billing cycle and are included as evidence.${ownerDetail}`, priority: 88, transactionIds: sorted.filter((row) => row.occurred_at.startsWith(duplicateMonths.at(-1)!)).map((row) => row.id), merchantKey });
    if (latestIncrease >= 0.2 && !seasonalMonthsPerYear) questions.push({ key: `recurring-price-increase:${key}:${lastPayment}`, type: "recurring_price_increase", prompt: `${pattern.providerName} increased by ${Math.round(latestIncrease * 100)}% at the latest payment. Is this the new normal amount?`, explanation: `Previous payment: ${pattern.currency} ${previousAmount.toFixed(2)}. Latest payment: ${pattern.currency} ${amounts.at(-1)!.toFixed(2)}.${ownerDetail}`, priority: 82, transactionIds: pattern.transactionIds.slice(-2), merchantKey });
    if (expectedDays && latestGap && !seasonalMonthsPerYear && !known?.paidByPartner && Math.abs(latestGap - expectedDays) > expectedDays * 0.6 && !missingMonths.length) questions.push({ key: `recurring-frequency-change:${key}:${lastPayment}`, type: "recurring_frequency_changed", prompt: `${pattern.providerName} arrived on a different schedule. Did its billing frequency change?`, explanation: `The latest gap was ${latestGap} days; the established ${frequency} pattern is approximately ${expectedDays} days.${ownerDetail}`, priority: 72, transactionIds: pattern.transactionIds.slice(-3), merchantKey });
    if (status !== "active" && !seasonalMonthsPerYear && !known?.paidByPartner) questions.push({ key: `recurring-stopped:${key}`, type: "recurring_may_have_stopped", prompt: `${pattern.providerName} may have stopped. Is it still active?`, explanation: `The last ${frequency} payment was ${lastPayment}.${ownerDetail}`, priority: 68, transactionIds: pattern.transactionIds.slice(-3), merchantKey });

  }

  const uncategorized = transactions.filter((row) => row.status === "posted" && !row.excluded_from_totals && row.kind === "expense" && !row.category_id);
  if (uncategorized.length) insights.push({ key: "uncategorized", title: `${uncategorized.length} transactions still need a category`, body: "Categorizing the largest repeated merchants will improve every report.", priority: 90, transactionIds: uncategorized.map((row) => row.id) });
  const spending = transactions.filter((row) => row.status === "posted" && !row.excluded_from_totals && ["expense", "fee", "tax"].includes(row.kind) && Number(row.amount) < 0);
  const typical = median(spending.map((row) => Math.abs(Number(row.amount))));
  const unusual = spending.filter((row) => Math.abs(Number(row.amount)) >= Math.max(500, typical * 4)).sort((left, right) => Math.abs(Number(right.amount)) - Math.abs(Number(left.amount))).slice(0, 8);
  if (unusual.length) insights.push({ key: `unusual:${today.slice(0, 7)}`, title: `${unusual.length} unusually large or extraordinary payments to review`, body: "These payments are at least four times the typical transaction or exceed 500 in their original currency.", priority: 78, transactionIds: unusual.map((row) => row.id) });
  return { patterns: patterns.sort((left, right) => right.transactionIds.length - left.transactionIds.length), questions: questions.sort((left, right) => right.priority - left.priority), insights: insights.sort((left, right) => right.priority - left.priority) };
}

function median(values: number[]) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function coefficientOfVariation(values: number[]) { const mean = values.reduce((sum, value) => sum + value, 0) / values.length; if (!mean) return Infinity; const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length; return Math.sqrt(variance) / mean; }
function daysBetween(left: string, right: string) { return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86_400_000); }
function addDays(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function unique<T>(values: T[]) { return [...new Set(values)]; }
function mostCommon(values: string[]) { return [...new Set(values)].sort((left, right) => values.filter((value) => value === right).length - values.filter((value) => value === left).length)[0]; }
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function formatMonth(value: string) { return new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" }); }
function findMissingMonths(dates: string[]) { const found = new Set(dates.map((date) => date.slice(0, 7))); const start = new Date(`${dates[0].slice(0, 7)}-01T00:00:00Z`); const end = new Date(`${dates.at(-1)!.slice(0, 7)}-01T00:00:00Z`); const missing: string[] = []; for (const cursor = new Date(start); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) { const month = cursor.toISOString().slice(0, 7); if (!found.has(month)) missing.push(month); } return missing; }
function looksMonthly(dates: string[], gaps: number[]) { const days = dates.map((date) => Number(date.slice(8, 10))); return gaps.every((gap) => gap >= 24 && gap <= 70) && Math.max(...days) - Math.min(...days) <= 10; }
