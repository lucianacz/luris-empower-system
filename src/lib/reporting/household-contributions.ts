import Decimal from "decimal.js";
import { isRuntimeDuplicate } from "@/lib/import/runtime-duplicates";
import type { WorkspaceTransaction } from "@/lib/workspace/demo";
import { buildSpendingReport, type TraceableAmount } from "./report";
import type { DateRange } from "./periods";

export type HouseholdContributorRole = "self" | "partner";

export interface HouseholdContributorAnalysis {
  role: HouseholdContributorRole;
  name: string;
  income: TraceableAmount;
  sharedPaid: TraceableAmount;
  personalPaid: TraceableAmount;
  incomeShare: number;
  householdFundingShare: number;
  contributionRate: number;
  proportionalTarget: number;
  differenceFromTarget: number;
  incomeAfterShared: number;
  incomeAfterSharedRate: number;
  approximateSavings: number;
  approximateSavingsRate: number;
}

export interface HouseholdContributionAnalysis {
  combinedIncome: TraceableAmount;
  sharedSpending: TraceableAmount;
  missingIncomeFxTransactionIds: string[];
  unassignedSharedSpending: TraceableAmount;
  equalEffortRate: number;
  contributors: HouseholdContributorAnalysis[];
}

export function analyzeHouseholdContributions(transactions: WorkspaceTransaction[], range: DateRange, today: string): HouseholdContributionAnalysis {
  const sharedRows = transactions.filter((transaction) => transaction.beneficiary_scope === "shared");
  const sharedSpending = buildSpendingReport(sharedRows, range, today).total;
  const incomeRows = transactions.filter((transaction) => isIncome(transaction) && inRange(transaction.occurred_at, range));
  const missingIncomeFxTransactionIds = incomeRows.filter((transaction) => usdIncome(transaction) == null).map((transaction) => transaction.id);
  const knownIncomeRows = incomeRows.filter((transaction) => usdIncome(transaction) != null);
  const combinedIncome = traceableIncome(knownIncomeRows);
  const assignedSharedIds = new Set<string>();

  const contributors = ([
    { role: "self", name: "Luciana" },
    { role: "partner", name: "Julian" },
  ] as const).map(({ role, name }) => {
    const personIncome = traceableIncome(knownIncomeRows.filter((transaction) => incomeOwnerRole(transaction) === role));
    const paidRows = sharedRows.filter((transaction) => payerRole(transaction) === role);
    const sharedPaid = buildSpendingReport(paidRows, range, today).total;
    const personalPaid = buildSpendingReport(transactions.filter((transaction) => transaction.beneficiary_scope !== "shared" && payerRole(transaction) === role), range, today).total;
    const allPaid = roundMoney(sharedPaid.amount + personalPaid.amount);
    sharedPaid.transactionIds.forEach((id) => assignedSharedIds.add(id));
    const incomeShare = ratio(personIncome.amount, combinedIncome.amount);
    const proportionalTarget = roundMoney(sharedSpending.amount * incomeShare);
    return {
      role,
      name,
      income: personIncome,
      sharedPaid,
      personalPaid,
      incomeShare,
      householdFundingShare: ratio(sharedPaid.amount, sharedSpending.amount),
      contributionRate: ratio(sharedPaid.amount, personIncome.amount),
      proportionalTarget,
      differenceFromTarget: roundMoney(sharedPaid.amount - proportionalTarget),
      incomeAfterShared: roundMoney(personIncome.amount - sharedPaid.amount),
      incomeAfterSharedRate: ratio(personIncome.amount - sharedPaid.amount, personIncome.amount),
      approximateSavings: roundMoney(personIncome.amount - allPaid),
      approximateSavingsRate: ratio(personIncome.amount - allPaid, personIncome.amount),
    };
  });

  const unassignedSharedRows = sharedRows.filter((transaction) => !assignedSharedIds.has(transaction.id));
  const unassignedSharedSpending = buildSpendingReport(unassignedSharedRows, range, today).total;

  return {
    combinedIncome,
    sharedSpending,
    missingIncomeFxTransactionIds,
    unassignedSharedSpending,
    equalEffortRate: ratio(sharedSpending.amount, combinedIncome.amount),
    contributors,
  };
}

function traceableIncome(rows: WorkspaceTransaction[]): TraceableAmount {
  const amount = rows.reduce((sum, transaction) => sum.plus(usdIncome(transaction) ?? 0), new Decimal(0));
  return { amount: amount.toDecimalPlaces(2).toNumber(), transactionIds: rows.map((transaction) => transaction.id) };
}

function isIncome(transaction: WorkspaceTransaction) {
  return transaction.status === "posted" && !isRuntimeDuplicate(transaction) && !transaction.excluded_from_totals && transaction.kind === "income" && Number(transaction.amount) > 0;
}

function usdIncome(transaction: WorkspaceTransaction) {
  if (transaction.currency === "USD") return Number(transaction.amount);
  return transaction.reporting_value?.reporting_currency === "USD" ? Math.abs(Number(transaction.reporting_value.reporting_amount)) : null;
}

function incomeOwnerRole(transaction: WorkspaceTransaction) {
  return transaction.account_owner?.role ?? transaction.paid_by?.role ?? null;
}

function payerRole(transaction: WorkspaceTransaction) {
  return transaction.paid_by?.role ?? transaction.account_owner?.role ?? null;
}

function inRange(value: string, range: DateRange) {
  const date = value.slice(0, 10);
  return date >= range.from && date <= range.to;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function roundMoney(value: number) {
  return new Decimal(value).toDecimalPlaces(2).toNumber();
}
