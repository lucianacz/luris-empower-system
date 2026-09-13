import Decimal from "decimal.js";
import type { TransferMatch } from "./matcher";

export interface TransferChain {
  id: string;
  matches: TransferMatch[];
  accountPath: string[];
  confidence: number;
  feeAmount: string;
}

export function buildTransferChains(matches: TransferMatch[], continuationDays = 30): TransferChain[] {
  const parents = new Map(matches.map((match) => [match.id, match.id]));
  const find = (id: string): string => {
    const parent = parents.get(id) ?? id;
    if (parent === id) return id;
    const root = find(parent);
    parents.set(id, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents.set(rightRoot, leftRoot);
  };

  for (const first of matches) {
    for (const second of matches) {
      if (first.id === second.id || first.targetAccountId !== second.sourceAccountId) continue;
      const gap = dayDifference(first.targetOccurredAt, second.sourceOccurredAt);
      if (gap < 0 || gap > continuationDays) continue;
      if (first.targetCurrency !== second.sourceCurrency) continue;
      const available = new Decimal(first.targetAmount).abs();
      const moved = new Decimal(second.sourceAmount).abs();
      if (moved.lte(available.mul(1.05)) || moved.minus(available).abs().lte(0.02)) union(first.id, second.id);
    }
  }

  const groups = new Map<string, TransferMatch[]>();
  for (const match of matches) {
    const root = find(match.id);
    groups.set(root, [...(groups.get(root) ?? []), match]);
  }

  return [...groups.values()].map((group, index) => {
    const ordered = group.slice().sort((left, right) => new Date(left.sourceOccurredAt).getTime() - new Date(right.sourceOccurredAt).getTime());
    const path = ordered.reduce<string[]>((accounts, match) => {
      if (!accounts.includes(match.sourceAccountId)) accounts.push(match.sourceAccountId);
      if (!accounts.includes(match.targetAccountId)) accounts.push(match.targetAccountId);
      return accounts;
    }, []);
    return {
      id: `chain-${index + 1}-${ordered[0]?.id ?? "empty"}`,
      matches: ordered,
      accountPath: path,
      confidence: Number((ordered.reduce((sum, match) => sum + match.confidence, 0) / Math.max(ordered.length, 1)).toFixed(4)),
      feeAmount: "0",
    };
  });
}

function dayDifference(left: string, right: string): number {
  return Math.round((new Date(right).getTime() - new Date(left).getTime()) / 86_400_000);
}
