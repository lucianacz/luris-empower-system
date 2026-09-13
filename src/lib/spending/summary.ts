import Decimal from "decimal.js";
import { isRuntimeDuplicate } from "@/lib/import/runtime-duplicates";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";

export interface SpendingCurrencySummary {
  currency: string;
  total: number;
  averagePerMonth: number;
  personal: number;
  household: number;
  essential: number;
  flexible: number;
  uncategorized: number;
  uncategorizedCount: number;
  months: Array<{ month: string; amount: number }>;
  categories: Array<{ name: string; lifeArea: string; color: string; amount: number; essential: boolean }>;
}

export function buildSpendingSummary(transactions: WorkspaceTransaction[]): SpendingCurrencySummary[] {
  const summaries = new Map<string, MutableSummary>();
  for (const transaction of transactions) {
    if (transaction.status !== "posted") continue;
    const entries = spendingEntries(transaction);
    for (const entry of entries) {
      const summary = summaries.get(transaction.currency) ?? emptySummary(transaction.currency);
      const month = transaction.occurred_at.slice(0, 7);
      summary.total = summary.total.plus(entry.amount);
      summary.months.set(month, (summary.months.get(month) ?? new Decimal(0)).plus(entry.amount));
      const personalShare = personalPercentage(transaction);
      summary.personal = summary.personal.plus(entry.amount.times(personalShare));
      summary.household = summary.household.plus(entry.amount.times(new Decimal(1).minus(personalShare)));
      if (entry.category?.is_essential) summary.essential = summary.essential.plus(entry.amount);
      else summary.flexible = summary.flexible.plus(entry.amount);
      const categoryName = entry.category?.name ?? "Uncategorized";
      const current = summary.categories.get(categoryName) ?? { name: categoryName, lifeArea: entry.category?.life_area ?? "Needs review", color: entry.category?.color ?? "#a9a39a", amount: new Decimal(0), essential: entry.category?.is_essential ?? false };
      current.amount = current.amount.plus(entry.amount);
      summary.categories.set(categoryName, current);
      if (!entry.category && entry.amount.isPositive()) {
        summary.uncategorized = summary.uncategorized.plus(entry.amount);
        summary.uncategorizedCount += 1;
      }
      summaries.set(transaction.currency, summary);
    }
  }
  return [...summaries.values()].map(finalizeSummary).sort((left, right) => left.currency.localeCompare(right.currency));
}

interface MutableSummary {
  currency: string;
  total: Decimal;
  personal: Decimal;
  household: Decimal;
  essential: Decimal;
  flexible: Decimal;
  uncategorized: Decimal;
  uncategorizedCount: number;
  months: Map<string, Decimal>;
  categories: Map<string, { name: string; lifeArea: string; color: string; amount: Decimal; essential: boolean }>;
}

function emptySummary(currency: string): MutableSummary { return { currency, total: new Decimal(0), personal: new Decimal(0), household: new Decimal(0), essential: new Decimal(0), flexible: new Decimal(0), uncategorized: new Decimal(0), uncategorizedCount: 0, months: new Map(), categories: new Map() }; }

function spendingEntries(transaction: WorkspaceTransaction) {
  if (isRuntimeDuplicate(transaction)) return [];
  const category = transaction.category ?? null;
  const entries: Array<{ amount: Decimal; category: WorkspaceTransaction["category"] }> = [];
  const amount = new Decimal(transaction.amount || 0);
  if (!transaction.excluded_from_totals && ["expense", "fee", "tax"].includes(transaction.kind) && amount.isNegative()) entries.push({ amount: amount.abs(), category });
  if (!transaction.excluded_from_totals && transaction.kind === "refund" && amount.isPositive()) entries.push({ amount: amount.negated(), category });
  const fee = new Decimal(transaction.fee_amount || 0).abs();
  if (transaction.excluded_from_totals && fee.isPositive()) entries.push({ amount: fee, category: { name: "Bank fees", life_area: "Financial", is_essential: true, color: "#9a5528" } });
  return entries;
}

function personalPercentage(transaction: WorkspaceTransaction) {
  const splits = transaction.expense_splits ?? [];
  if (!splits.length) return new Decimal(1);
  return splits.filter((split) => split.split_kind === "personal").reduce((total, split) => total.plus(split.percentage ?? 0), new Decimal(0));
}

function finalizeSummary(summary: MutableSummary): SpendingCurrencySummary {
  const months = [...summary.months.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([month, amount]) => ({ month, amount: amount.toNumber() }));
  const monthSpan = months.length ? inclusiveMonthCount(months[0].month, months.at(-1)!.month) : 0;
  return { currency: summary.currency, total: summary.total.toNumber(), averagePerMonth: monthSpan ? summary.total.div(monthSpan).toNumber() : 0, personal: summary.personal.toNumber(), household: summary.household.toNumber(), essential: summary.essential.toNumber(), flexible: summary.flexible.toNumber(), uncategorized: summary.uncategorized.toNumber(), uncategorizedCount: summary.uncategorizedCount, months, categories: [...summary.categories.values()].map((category) => ({ ...category, amount: category.amount.toNumber() })).filter((category) => category.amount > 0).sort((left, right) => right.amount - left.amount) };
}

function inclusiveMonthCount(start: string, end: string) { const [startYear, startMonth] = start.split("-").map(Number); const [endYear, endMonth] = end.split("-").map(Number); return (endYear - startYear) * 12 + endMonth - startMonth + 1; }
