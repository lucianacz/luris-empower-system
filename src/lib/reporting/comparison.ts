import type { SpendingReport } from "./report";

export interface SpendingCategoryComparison {
  id: string;
  name: string;
  color: string;
  selectedAmount: number;
  comparisonAmount: number;
  difference: number;
  percentageChange: number | null;
  selectedTransactionIds: string[];
  comparisonTransactionIds: string[];
}

export function compareSpendingCategories(selected: SpendingReport, comparison: SpendingReport): SpendingCategoryComparison[] {
  const selectedById = new Map(selected.categories.map((category) => [category.id, category]));
  const comparisonById = new Map(comparison.categories.map((category) => [category.id, category]));
  const ids = new Set([...selectedById.keys(), ...comparisonById.keys()]);

  return [...ids].map((id) => {
    const current = selectedById.get(id);
    const previous = comparisonById.get(id);
    const selectedAmount = current?.amount ?? 0;
    const comparisonAmount = previous?.amount ?? 0;
    return {
      id,
      name: current?.name ?? previous?.name ?? "Uncategorized",
      color: current?.color ?? previous?.color ?? "#a9a39a",
      selectedAmount,
      comparisonAmount,
      difference: roundCurrency(selectedAmount - comparisonAmount),
      percentageChange: percentageChange(selectedAmount, comparisonAmount),
      selectedTransactionIds: current?.transactionIds ?? [],
      comparisonTransactionIds: previous?.transactionIds ?? [],
    };
  }).sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference));
}

export function percentageChange(selectedAmount: number, comparisonAmount: number): number | null {
  if (comparisonAmount === 0) return selectedAmount === 0 ? 0 : null;
  return (selectedAmount - comparisonAmount) / Math.abs(comparisonAmount);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
