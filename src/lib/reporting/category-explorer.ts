import type { SpendingGroup, TraceableAmount } from "./report";

export const categoryExplorerPresets = [
  { key: "all-car", label: "All car", categoryNames: ["Car", "Car rental", "Car repairs", "Fuel & gas", "Parking", "Tolls & highways"] },
  { key: "food", label: "Food", categoryNames: ["Groceries", "Dining out"] },
  { key: "health", label: "Health", categoryNames: ["Health", "Health insurance", "Private health", "Dentist", "Dermatology", "Pharmacy", "Therapy", "Alternative therapy"] },
  { key: "travel", label: "Travel", categoryNames: ["Travel", "Flights", "Hotels", "Diving & activities", "Visas"] },
  { key: "home", label: "Home", categoryNames: ["Housing", "Cleaning", "Bills & utilities"] },
] as const;

export function categoryIdsForPreset(categories: SpendingGroup[], key: string) {
  const preset = categoryExplorerPresets.find((item) => item.key === key);
  if (!preset) return [];
  const names = new Set<string>(preset.categoryNames);
  return categories.filter((category) => names.has(category.name)).map((category) => category.id);
}

export function summarizeCategorySelection(categories: SpendingGroup[], selectedIds: string[]): TraceableAmount {
  const ids = new Set(selectedIds);
  const selected = categories.filter((category) => ids.has(category.id));
  return {
    amount: Number(selected.reduce((sum, category) => sum + category.amount, 0).toFixed(2)),
    transactionIds: [...new Set(selected.flatMap((category) => category.transactionIds))],
  };
}

