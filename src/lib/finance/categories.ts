import type { CategoryRow } from "./types";

export type CategoryOption = CategoryRow & {
  path: string;
  depth: number;
  children: CategoryOption[];
};

// Seções na ordem pedida: receitas primeiro, depois despesas. "transfer"
// não tem seção própria na tela de categorias, então fica por último.
const TYPE_ORDER: Record<string, number> = { income: 0, expense: 1, transfer: 2 };

/** Dentro de um mesmo grupo de irmãs: sort_order manual quando presente
 *  (subir/descer em /cadastros/categorias), senão ordem alfabética — esse
 *  é o comportamento padrão até a primeira reordenação manual do grupo. */
function compareSiblings(a: CategoryOption, b: CategoryOption): number {
  const typeDiff = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
  if (typeDiff !== 0) return typeDiff;
  if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order;
  if (a.sort_order != null) return -1;
  if (b.sort_order != null) return 1;
  return a.name.localeCompare(b.name, "pt-BR");
}

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

  const sortTree = (items: CategoryOption[]) => {
    items.sort(compareSiblings);
    items.forEach((item) => sortTree(item.children));
  };

  sortTree(roots);
  fillPaths(roots, "", 0);
  return roots;
}

/** Encontra o grupo de irmãs (array irmão, na mesma ordem exibida) que
 *  contém categoryId — usado pelos botões subir/descer, que precisam saber
 *  a posição atual e trocar com o vizinho. */
export function findSiblingGroup(
  tree: CategoryOption[],
  categoryId: string,
): CategoryOption[] | null {
  if (tree.some((node) => node.id === categoryId)) return tree;
  for (const node of tree) {
    const found = findSiblingGroup(node.children, categoryId);
    if (found) return found;
  }
  return null;
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
