import Decimal from "decimal.js";
import type { NormalizedTransaction } from "@/lib/import/types";

export interface TransferCandidate extends NormalizedTransaction {
  id: string;
  accountId: string;
}

export interface TransferMatch {
  id: string;
  sourceTransactionId: string;
  targetTransactionId: string;
  sourceAccountId: string;
  targetAccountId: string;
  sourceAmount: string;
  sourceCurrency: string;
  targetAmount: string;
  targetCurrency: string;
  sourceOccurredAt: string;
  targetOccurredAt: string;
  confidence: number;
  reasons: string[];
}

interface AmountComparison {
  comparableSource: Decimal;
  comparableTarget: Decimal;
  sourcePerTarget: Decimal;
  basis: "same-currency" | "source-original" | "target-original";
}

export function matchTransfers(transactions: TransferCandidate[], dayWindow = 10): TransferMatch[] {
  const allocationEpsilon = new Decimal("0.00000001");
  const candidates = transactions.filter((transaction) => transaction.status === "posted" && ["transfer", "unknown"].includes(transaction.kind));
  const outgoing = candidates.filter((transaction) => new Decimal(transaction.amount).isNegative()).sort(byDate);
  const incoming = candidates.filter((transaction) => new Decimal(transaction.amount).isPositive()).sort(byDate);
  const remaining = new Map(incoming.map((transaction) => [transaction.id, new Decimal(transaction.amount).abs()]));
  const matches: TransferMatch[] = [];

  for (const source of outgoing) {
    let sourceRemaining = new Decimal(source.amount).abs();
    const ranked = incoming
      .filter((target) => target.accountId !== source.accountId && (remaining.get(target.id)?.gt(0) ?? false))
      .map((target) => ({ target, comparison: comparableAmounts(source, target), days: dayDifference(source.occurredAt, target.occurredAt) }))
      .filter((candidate): candidate is { target: TransferCandidate; comparison: AmountComparison; days: number } => Boolean(candidate.comparison) && candidate.days >= -2 && candidate.days <= dayWindow)
      .map((candidate) => ({ ...candidate, score: matchScore(source, candidate.target, candidate.comparison, candidate.days) }))
      .filter((candidate) => candidate.score >= 0.45)
      .sort((left, right) => right.score - left.score);

    for (const candidate of ranked) {
      if (!sourceRemaining.gt(allocationEpsilon)) break;
      const targetRemaining = remaining.get(candidate.target.id) ?? new Decimal(0);
      if (!targetRemaining.gt(allocationEpsilon)) continue;

      const ratio = candidate.comparison.sourcePerTarget;
      const allocationTarget = Decimal.min(targetRemaining, ratio.isZero() ? targetRemaining : sourceRemaining.div(ratio));
      const allocationSource = Decimal.min(sourceRemaining, allocationTarget.mul(ratio));
      if (!allocationSource.gt(allocationEpsilon)) continue;

      matches.push({
        id: `match-${source.id}-${candidate.target.id}-${matches.length}`,
        sourceTransactionId: source.id,
        targetTransactionId: candidate.target.id,
        sourceAccountId: source.accountId,
        targetAccountId: candidate.target.accountId,
        sourceAmount: allocationSource.toFixed(),
        sourceCurrency: source.currency,
        targetAmount: allocationTarget.toFixed(),
        targetCurrency: candidate.target.currency,
        sourceOccurredAt: source.occurredAt,
        targetOccurredAt: candidate.target.occurredAt,
        confidence: candidate.score,
        reasons: [
          candidate.comparison.basis === "same-currency" ? "Amounts match in the same currency" : "Converted/original amounts align",
          `${Math.abs(candidate.days)} day posting difference`,
          ...(source.sourceId && candidate.target.sourceId && source.sourceId === candidate.target.sourceId ? ["Shared provider reference"] : []),
        ],
      });
      sourceRemaining = sourceRemaining.minus(allocationSource);
      remaining.set(candidate.target.id, targetRemaining.minus(allocationTarget));
    }
  }

  return matches;
}

function comparableAmounts(source: TransferCandidate, target: TransferCandidate): AmountComparison | null {
  const sourceAmount = new Decimal(source.amount).abs();
  const targetAmount = new Decimal(target.amount).abs();
  if (source.currency === target.currency) return { comparableSource: sourceAmount, comparableTarget: targetAmount, sourcePerTarget: new Decimal(1), basis: "same-currency" };
  if (source.originalCurrency === target.currency && source.originalAmount) {
    const original = new Decimal(source.originalAmount).abs();
    return { comparableSource: original, comparableTarget: targetAmount, sourcePerTarget: original.isZero() ? new Decimal(1) : sourceAmount.div(original), basis: "source-original" };
  }
  if (target.originalCurrency === source.currency && target.originalAmount) {
    const original = new Decimal(target.originalAmount).abs();
    return { comparableSource: sourceAmount, comparableTarget: original, sourcePerTarget: targetAmount.isZero() ? new Decimal(1) : original.div(targetAmount), basis: "target-original" };
  }
  return null;
}

function matchScore(source: TransferCandidate, target: TransferCandidate, comparison: AmountComparison, days: number): number {
  const largest = Decimal.max(comparison.comparableSource, comparison.comparableTarget, 1);
  const feeAllowance = new Decimal(source.feeAmount || 0).abs().plus(target.feeAmount || 0).abs();
  const difference = comparison.comparableSource.minus(comparison.comparableTarget).abs();
  const amountRatio = Decimal.max(new Decimal(0), new Decimal(1).minus(Decimal.max(difference.minus(feeAllowance), 0).div(largest)));
  const dateScore = Math.max(0, 1 - Math.abs(days) / 14);
  const explicitTypeBonus = source.kind === "transfer" && target.kind === "transfer" ? 0.08 : 0;
  const sharedReferenceBonus = source.sourceId && source.sourceId === target.sourceId ? 0.15 : 0;
  return Math.min(0.99, Number(amountRatio.mul(0.72).plus(dateScore * 0.2).plus(explicitTypeBonus).plus(sharedReferenceBonus).toDecimalPlaces(4)));
}

function dayDifference(left: string, right: string): number {
  return Math.round((new Date(right).getTime() - new Date(left).getTime()) / 86_400_000);
}

function byDate(left: TransferCandidate, right: TransferCandidate): number {
  return new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();
}
