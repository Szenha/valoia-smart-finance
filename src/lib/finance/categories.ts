import type { CategoryRow } from "./types";

export type CategoryOption = CategoryRow & {
  path: string;
  depth: number;
  children: CategoryOption[];
};

export function buildCategoryTree(categories: CategoryRow[]): CategoryOption[] {
  const byId = new Map<string, CategoryOption>();
  const roots: CategoryOption[] = [];

  for (const category of categories) {
    byId.set(category.id, { ...category, path: category.name, depth: 0, children: [] });
  }

  for (const category of byId.values()) {
    const parent = category.parent_id ? byId.get(category.parent_id) : null;
    if (parent) {
      parent.children.push(category);
    } else {
      roots.push(category);
    }
  }

  const sortByName = (items: CategoryOption[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    items.forEach((item) => sortByName(item.children));
  };

  sortByName(roots);
  fillPaths(roots, "", 0);
  return roots;
}

export function categoryOptions(categories: CategoryRow[]): CategoryOption[] {
  const ordered: CategoryOption[] = [];
  const walk = (items: CategoryOption[]) => {
    for (const item of items) {
      ordered.push(item);
      walk(item.children);
    }
  };

  walk(buildCategoryTree(categories));
  return ordered;
}

/**
 * Categories eligible to receive a transaction: leaves only. A category that
 * has subcategories underneath it is an aggregate and must never be picked
 * directly — the most specific descendant should be chosen instead.
 */
export function leafCategoryOptions(categories: CategoryRow[]): CategoryOption[] {
  return categoryOptions(categories).filter((category) => category.children.length === 0);
}

export function rootCategoryOptions(categories: CategoryRow[]): CategoryOption[] {
  return categoryOptions(categories).filter((category) => category.depth === 0);
}

export function categoryPath(categories: CategoryRow[], categoryId: string | null | undefined) {
  if (!categoryId) return "Sem categoria";
  return (
    categoryOptions(categories).find((category) => category.id === categoryId)?.path ?? "Categoria"
  );
}

export function descendantCategoryIds(categories: CategoryRow[], categoryId: string) {
  const children = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parent_id) continue;
    const ids = children.get(category.parent_id) ?? [];
    ids.push(category.id);
    children.set(category.parent_id, ids);
  }

  const ids = [categoryId];
  for (let index = 0; index < ids.length; index += 1) {
    ids.push(...(children.get(ids[index]) ?? []));
  }
  return ids;
}

function fillPaths(items: CategoryOption[], parentPath: string, depth: number) {
  for (const item of items) {
    item.depth = depth;
    item.path = parentPath ? `${parentPath} > ${item.name}` : item.name;
    fillPaths(item.children, item.path, depth + 1);
  }
}
