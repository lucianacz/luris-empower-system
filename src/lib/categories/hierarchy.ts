import type { WorkspaceCategory } from "@/lib/workspace/demo";

export interface CategoryOption {
  category: WorkspaceCategory;
  label: string;
  depth: number;
}

export function categoryOptions(categories: WorkspaceCategory[], kind?: string): CategoryOption[] {
  const filtered = categories.filter((category) => !kind || category.kind === kind);
  const byId = new Map(filtered.map((category) => [category.id, category]));
  const childrenByParent = new Map<string, WorkspaceCategory[]>();
  const roots: WorkspaceCategory[] = [];

  for (const category of filtered) {
    if (!category.parent_id || !byId.has(category.parent_id) || category.parent_id === category.id) {
      roots.push(category);
      continue;
    }
    childrenByParent.set(category.parent_id, [...(childrenByParent.get(category.parent_id) ?? []), category]);
  }

  const sortByName = (left: WorkspaceCategory, right: WorkspaceCategory) => left.name.localeCompare(right.name);
  roots.sort(sortByName);
  for (const children of childrenByParent.values()) children.sort(sortByName);

  const options: CategoryOption[] = [];
  const visited = new Set<string>();
  const visit = (category: WorkspaceCategory, parentPath: string[]) => {
    if (visited.has(category.id)) return;
    visited.add(category.id);
    const path = [...parentPath, category.name];
    options.push({ category, label: path.join(" → "), depth: parentPath.length });
    for (const child of childrenByParent.get(category.id) ?? []) visit(child, path);
  };

  for (const root of roots) visit(root, []);
  for (const category of filtered.sort(sortByName)) visit(category, []);

  return options;
}
