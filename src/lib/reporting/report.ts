import Decimal from "decimal.js";
import { isRuntimeDuplicate } from "@/lib/import/runtime-duplicates";
import { defaultExpenseCategories, suggestDefaultCategory } from "@/lib/categories/defaults";
import { completedMonthKeys, monthKeysInRange, normalizeRange, type DateRange } from "./periods";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";

export interface TraceableAmount {
  amount: number;
  transactionIds: string[];
}

export interface MonthlySpending extends TraceableAmount {
  month: string;
  normalizedAmount: number;
  normalizedTransactionIds: string[];
  isCurrentPartial: boolean;
  isCompleted: boolean;
}

export interface SpendingGroup extends TraceableAmount {
  id: string;
  name: string;
  color: string;
  detail?: string;
  essential?: boolean;
  extraordinary?: boolean;
}

export interface MerchantSpending extends TraceableAmount {
  id: string;
  name: string;
  visits: number;
  averagePerVisit: number;
  dates: string[];
  country: string | null;
  originalCurrencies: string[];
}

export interface SpendingReport {
  reportingCurrency: "USD";
  range: DateRange;
  total: TraceableAmount;
  normalizedTotal: TraceableAmount;
  completedAverage: TraceableAmount & { monthCount: number; months: string[] };
  currentPartial: TraceableAmount & { month: string; included: boolean };
  monthly: MonthlySpending[];
  categories: SpendingGroup[];
  lifeAreas: SpendingGroup[];
  locations: SpendingGroup[];
  merchants: MerchantSpending[];
  personal: TraceableAmount;
  household: TraceableAmount;
  essential: TraceableAmount;
  flexible: TraceableAmount;
  extraordinary: TraceableAmount;
  originalCurrencies: Array<{ currency: string; amount: number; transactionIds: string[] }>;
  missingFxTransactionIds: string[];
  transactionCount: number;
}

export function buildSpendingReport(transactions: WorkspaceTransaction[], inputRange: DateRange, today: string): SpendingReport {
  const range = normalizeRange(inputRange);
  const monthKeys = monthKeysInRange(range);
  const completed = completedMonthKeys(range, today);
  const currentMonth = today.slice(0, 7);
  const monthly = new Map(monthKeys.map((month) => [month, mutableMonth(month, month === currentMonth, completed.includes(month))]));
  const categories = new Map<string, MutableGroup>();
  const lifeAreas = new Map<string, MutableGroup>();
  const locations = new Map<string, MutableGroup>();
  const merchants = new Map<string, MutableMerchant>();
  const originals = new Map<string, MutableAmount>();
  const missingFx = new Set<string>();
  const total = mutableAmount();
  const normalizedTotal = mutableAmount();
  const personal = mutableAmount();
  const household = mutableAmount();
  const essential = mutableAmount();
  const flexible = mutableAmount();
  const extraordinary = mutableAmount();

  for (const transaction of transactions) {
    const date = transaction.occurred_at.slice(0, 10);
    if (date < range.from || date > range.to || transaction.status !== "posted") continue;
    const value = spendingValue(transaction);
    if (value.isZero()) continue;
    const reportingValue = toReportingValue(transaction, value);
    if (reportingValue == null) {
      missingFx.add(transaction.id);
      continue;
    }

    add(total, reportingValue, transaction.id);
    add(monthly.get(date.slice(0, 7))!, reportingValue, transaction.id);
    const originalCurrency = transaction.original_currency || transaction.currency;
    const originalBase = transaction.original_amount != null && new Decimal(transaction.original_amount).abs().greaterThan(0) ? new Decimal(transaction.original_amount).abs().times(value.isNegative() ? -1 : 1) : value;
    add(originals.get(originalCurrency) ?? set(originals, originalCurrency, mutableAmount()), originalBase, transaction.id);

    const category = categoryFor(transaction);
    addGroup(categories, category.id, category.name, category.color, reportingValue, transaction.id, { detail: category.lifeArea, essential: category.essential, extraordinary: category.extraordinary });
    addGroup(lifeAreas, category.lifeArea, category.lifeArea, category.color, reportingValue, transaction.id);
    const location = transaction.location_period?.location;
    const locationName = location?.country_name || location?.name || "Location not confirmed";
    addGroup(locations, transaction.location_period?.id ?? "unconfirmed", locationName, transaction.location_period ? "#496f5d" : "#a9a39a", reportingValue, transaction.id, { detail: transaction.location_period?.period_type?.replaceAll("_", " ") });

    const personalShare = personalPercentage(transaction);
    add(personal, reportingValue.times(personalShare), transaction.id);
    add(household, reportingValue.times(new Decimal(1).minus(personalShare)), transaction.id);
    add(category.essential ? essential : flexible, reportingValue, transaction.id);
    if (category.extraordinary) add(extraordinary, reportingValue, transaction.id);

    const merchantKey = transaction.merchant_key || canonicalMerchant(transaction.merchant_name || transaction.description);
    const merchant = merchants.get(merchantKey) ?? { ...mutableAmount(), id: merchantKey, name: transaction.merchant_name || transaction.description, dates: new Set<string>(), country: transaction.merchant_country || null, originalCurrencies: new Set<string>() };
    add(merchant, reportingValue, transaction.id);
    merchant.dates.add(date);
    merchant.originalCurrencies.add(transaction.currency);
    merchants.set(merchantKey, merchant);

    const allocations = transaction.expense_allocations ?? [];
    if (!allocations.length) {
      add(normalizedTotal, reportingValue, transaction.id);
      addNormalized(monthly.get(date.slice(0, 7))!, reportingValue, transaction.id);
    }
  }

  for (const transaction of transactions) {
    for (const allocation of transaction.expense_allocations ?? []) {
      const serviceMonth = allocation.service_month.slice(0, 7);
      if (!monthly.has(serviceMonth)) continue;
      const value = allocation.reporting_amount != null ? new Decimal(allocation.reporting_amount) : allocation.currency === "USD" ? new Decimal(allocation.amount) : null;
      if (value == null) {
        missingFx.add(transaction.id);
        continue;
      }
      const normalized = value.abs();
      add(normalizedTotal, normalized, transaction.id);
      addNormalized(monthly.get(serviceMonth)!, normalized, transaction.id);
    }
  }

  const completedIds = unique(completed.flatMap((month) => monthly.get(month)?.transactionIds ?? []));
  const completedAmount = completed.reduce((sum, month) => sum.plus(monthly.get(month)?.amount ?? 0), new Decimal(0));
  const current = monthly.get(currentMonth);
  return {
    reportingCurrency: "USD",
    range,
    total: finalize(total),
    normalizedTotal: finalize(normalizedTotal),
    completedAverage: { amount: completed.length ? completedAmount.div(completed.length).toNumber() : 0, transactionIds: completedIds, monthCount: completed.length, months: completed },
    currentPartial: { amount: current?.amount.toNumber() ?? 0, transactionIds: current?.transactionIds ?? [], month: currentMonth, included: Boolean(current) },
    monthly: [...monthly.values()].map((month) => ({ month: month.month, amount: month.amount.toNumber(), transactionIds: month.transactionIds, normalizedAmount: month.normalizedAmount.toNumber(), normalizedTransactionIds: month.normalizedTransactionIds, isCurrentPartial: month.isCurrentPartial, isCompleted: month.isCompleted })),
    categories: finalizeGroups(categories),
    lifeAreas: finalizeGroups(lifeAreas),
    locations: finalizeGroups(locations),
    merchants: [...merchants.values()].map((merchant) => ({ id: merchant.id, name: merchant.name, amount: merchant.amount.toNumber(), transactionIds: merchant.transactionIds, visits: merchant.dates.size, averagePerVisit: merchant.dates.size ? merchant.amount.div(merchant.dates.size).toNumber() : 0, dates: [...merchant.dates].sort(), country: merchant.country, originalCurrencies: [...merchant.originalCurrencies].sort() })).sort((left, right) => right.amount - left.amount),
    personal: finalize(personal),
    household: finalize(household),
    essential: finalize(essential),
    flexible: finalize(flexible),
    extraordinary: finalize(extraordinary),
    originalCurrencies: [...originals.entries()].map(([currency, value]) => ({ currency, ...finalize(value) })).sort((left, right) => left.currency.localeCompare(right.currency)),
    missingFxTransactionIds: [...missingFx],
    transactionCount: total.transactionIds.length,
  };
}

interface MutableAmount { amount: Decimal; transactionIds: string[] }
interface MutableMonth extends MutableAmount { month: string; normalizedAmount: Decimal; normalizedTransactionIds: string[]; isCurrentPartial: boolean; isCompleted: boolean }
interface MutableGroup extends MutableAmount { id: string; name: string; color: string; detail?: string; essential?: boolean; extraordinary?: boolean }
interface MutableMerchant extends MutableAmount { id: string; name: string; dates: Set<string>; country: string | null; originalCurrencies: Set<string> }

function mutableAmount(): MutableAmount { return { amount: new Decimal(0), transactionIds: [] }; }
function mutableMonth(month: string, isCurrentPartial: boolean, isCompleted: boolean): MutableMonth { return { ...mutableAmount(), month, normalizedAmount: new Decimal(0), normalizedTransactionIds: [], isCurrentPartial, isCompleted }; }
function set<T>(map: Map<string, T>, key: string, value: T) { map.set(key, value); return value; }
function add(target: MutableAmount, value: Decimal, transactionId: string) { target.amount = target.amount.plus(value); if (!target.transactionIds.includes(transactionId)) target.transactionIds.push(transactionId); }
function addNormalized(target: MutableMonth, value: Decimal, transactionId: string) { target.normalizedAmount = target.normalizedAmount.plus(value); if (!target.normalizedTransactionIds.includes(transactionId)) target.normalizedTransactionIds.push(transactionId); }
function finalize(value: MutableAmount): TraceableAmount { return { amount: value.amount.toDecimalPlaces(2).toNumber(), transactionIds: value.transactionIds }; }
function unique(values: string[]) { return [...new Set(values)]; }

function addGroup(map: Map<string, MutableGroup>, id: string, name: string, color: string, amount: Decimal, transactionId: string, extras: Partial<MutableGroup> = {}) {
  const group = map.get(id) ?? { ...mutableAmount(), id, name, color, ...extras };
  add(group, amount, transactionId);
  map.set(id, group);
}

function finalizeGroups(groups: Map<string, MutableGroup>): SpendingGroup[] {
  return [...groups.values()].map((group) => ({ id: group.id, name: group.name, color: group.color, detail: group.detail, essential: group.essential, extraordinary: group.extraordinary, ...finalize(group) })).filter((group) => group.amount !== 0).sort((left, right) => right.amount - left.amount);
}

function spendingValue(transaction: WorkspaceTransaction) {
  if (isRuntimeDuplicate(transaction)) return new Decimal(0);
  const amount = new Decimal(transaction.amount || 0);
  if (!transaction.excluded_from_totals && ["expense", "fee", "tax"].includes(transaction.kind) && amount.isNegative()) return amount.abs();
  if (!transaction.excluded_from_totals && transaction.kind === "refund" && amount.isPositive() && !amount.isZero()) return amount.negated();
  const fee = new Decimal(transaction.fee_amount || 0).abs();
  if (transaction.excluded_from_totals && fee.greaterThan(0)) return fee;
  return new Decimal(0);
}

function toReportingValue(transaction: WorkspaceTransaction, value: Decimal) {
  if (transaction.currency === "USD") return value;
  const reporting = transaction.reporting_value;
  if (!reporting || reporting.reporting_currency !== "USD") return null;
  const source = new Decimal(transaction.amount || 0).abs();
  if (source.isZero()) return null;
  return new Decimal(reporting.reporting_amount).abs().times(value.div(source));
}

function categoryFor(transaction: WorkspaceTransaction) {
  const category = transaction.category;
  const transferFee = transaction.excluded_from_totals && new Decimal(transaction.fee_amount || 0).abs().greaterThan(0);
  if (transferFee) {
    const configured = defaultExpenseCategories.find((item) => item.name === "Bank fees");
    return { id: configured?.name ?? "bank-fees", name: "Bank fees", lifeArea: configured?.lifeArea ?? "Financial", essential: configured?.essential ?? false, extraordinary: false, color: configured?.color ?? "#9c6644" };
  }
  const flight = isFlight(transaction);
  const suggestedName = !category ? suggestDefaultCategory({ kind: transaction.kind as "expense", description: transaction.description, metadata: scalarMetadata(transaction.metadata), amount: transaction.amount, currency: transaction.currency }) : null;
  const suggested = suggestedName ? defaultExpenseCategories.find((item) => item.name === suggestedName) : null;
  return {
    id: flight ? "flights" : transaction.category_id ?? suggested?.name ?? "uncategorized",
    name: flight ? "Flights" : category?.name ?? suggested?.name ?? "Uncategorized",
    lifeArea: category?.life_area ?? suggested?.lifeArea ?? "Needs review",
    essential: category?.is_essential ?? suggested?.essential ?? false,
    extraordinary: flight || category?.is_extraordinary === true || suggested?.extraordinary === true,
    color: flight ? "#416788" : category?.color ?? suggested?.color ?? "#a9a39a",
  };
}

function scalarMetadata(metadata: Record<string, unknown> | undefined) {
  return Object.fromEntries(Object.entries(metadata ?? {}).filter((entry): entry is [string, string | number | boolean | null] => entry[1] === null || ["string", "number", "boolean"].includes(typeof entry[1])));
}

function isFlight(transaction: WorkspaceTransaction) {
  if (transaction.category?.name === "Flights") return true;
  const text = `${transaction.description} ${transaction.metadata?.mccLabel ?? ""}`;
  return /airline|aeroline|avianca|latam|lan airline|copa air|vivaaerobus|sansa|air transport/i.test(text);
}

function personalPercentage(transaction: WorkspaceTransaction) {
  const splits = transaction.expense_splits ?? [];
  if (!splits.length) return transaction.beneficiary_scope === "shared" ? new Decimal(0.5) : new Decimal(1);
  return splits.filter((split) => split.split_kind === "personal").reduce((sum, split) => sum.plus(split.percentage ?? 0), new Decimal(0));
}

export function canonicalMerchant(value: string) {
  return value.toLocaleLowerCase().replace(/^(card charge|payment to)\s*[-:]?\s*/i, "").replace(/\b(?:visa|mastercard)\b/gi, "").replace(/[\d*#_-]{3,}/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ").slice(0, 120) || "unknown";
}
