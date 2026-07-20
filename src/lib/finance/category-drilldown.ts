import { useMemo, useState } from "react";
import { descendantCategoryIds } from "./categories";
import type { CategoryRow } from "./types";

/** Forma mínima aceita das RPCs expenses_by_category(_for_user) — sempre
 *  agregadas por categoria FOLHA (só folhas recebem transação, ver
 *  leafCategoryOptions em categories.ts), nunca por categoria-mãe. */
export type CategoryTotalRow = {
  category_id: string | null;
  total: number | string;
};

export type CategoryBucket = {
  /** null só pro bucket agregado "Sem categoria", sempre no nível raiz. */
  categoryId: string | null;
  name: string;
  color: string | null;
  total: number;
  /** Tem subcategorias — clicar entra num nível mais granular. */
  drillable: boolean;
};

/**
 * Agrupa totais por categoria-folha em "baldes" no nível pedido: raiz
 * (parentId null) mostra as categorias de primeiro nível, cada uma somando
 * todas as folhas descendentes; passar o id de uma categoria mostra os
 * filhos diretos dela, cada um por sua vez somando suas próprias folhas.
 * Puro client-side — não faz nenhuma chamada nova ao banco, só reagrupa o
 * que expenses_by_category(_for_user) já retorna.
 */
export function categoryBucketsAt(
  categories: CategoryRow[],
  rows: CategoryTotalRow[],
  parentId: string | null,
): CategoryBucket[] {
  const totalByCategoryId = new Map<string | null, number>();
  for (const row of rows) {
    const key = row.category_id ?? null;
    totalByCategoryId.set(key, (totalByCategoryId.get(key) ?? 0) + Number(row.total));
  }

  const children = categories.filter((category) => (category.parent_id ?? null) === parentId);
  const buckets: CategoryBucket[] = children.map((category) => {
    const leafIds = descendantCategoryIds(categories, category.id);
    const total = leafIds.reduce((sum, id) => sum + (totalByCategoryId.get(id) ?? 0), 0);
    const drillable = categories.some((c) => c.parent_id === category.id);
    return {
      categoryId: category.id,
      name: category.name,
      color: category.color ?? null,
      total,
      drillable,
    };
  });

  if (parentId === null) {
    const uncategorized = totalByCategoryId.get(null) ?? 0;
    if (uncategorized > 0) {
      buckets.push({
        categoryId: null,
        name: "Sem categoria",
        color: null,
        total: uncategorized,
        drillable: false,
      });
    }
  }

  return buckets.filter((bucket) => bucket.total > 0).sort((a, b) => b.total - a.total);
}

export type CategoryBreadcrumbStep = { id: string; name: string };

/** Estado de navegação (pilha de drill-down) + os baldes já calculados pro
 *  nível atual — usado tanto pelo card de pizza do Dashboard quanto pela
 *  listagem de Relatórios, cada um renderizando `buckets` do seu jeito. */
export function useCategoryDrilldown(categories: CategoryRow[], rows: CategoryTotalRow[]) {
  const [path, setPath] = useState<CategoryBreadcrumbStep[]>([]);
  const parentId = path.length > 0 ? path[path.length - 1].id : null;
  const buckets = useMemo(
    () => categoryBucketsAt(categories, rows, parentId),
    [categories, rows, parentId],
  );

  function drillInto(bucket: CategoryBucket) {
    if (!bucket.drillable || !bucket.categoryId) return;
    setPath((current) => [...current, { id: bucket.categoryId!, name: bucket.name }]);
  }
  function drillToRoot() {
    setPath([]);
  }
  function drillToStep(index: number) {
    setPath((current) => current.slice(0, index + 1));
  }

  return { path, buckets, drillInto, drillToRoot, drillToStep };
}
