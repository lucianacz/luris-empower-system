const locationIndependentCategories = new Set([
  "Papaya Kids",
  "Subscriptions & software",
]);

export function isLocationIndependentCategory(categoryName: string | null | undefined) {
  return Boolean(categoryName && locationIndependentCategories.has(categoryName));
}
