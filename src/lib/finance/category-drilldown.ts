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

/** Um balde por categoria-FOLHA (o nível mais detalhado possível), sem
 *  agrupar por categoria-mãe — cada folha usa seu próprio nome/cor. Já que
 *  as linhas de `rows` vêm sempre por folha (ver CategoryTotalRow acima),
 *  isso é só o total de cada uma, sem nenhuma soma extra. Base do modo
 *  "detalhado" (padrão de useCategoryDrilldown). */
export function categoryLeafBuckets(
  categories: CategoryRow[],
  rows: CategoryTotalRow[],
): CategoryBucket[] {
  const totalByCategoryId = new Map<string | null, number>();
  for (const row of rows) {
    const key = row.category_id ?? null;
    totalByCategoryId.set(key, (totalByCategoryId.get(key) ?? 0) + Number(row.total));
  }

  const byId = new Map(categories.map((category) => [category.id, category]));
  const buckets: CategoryBucket[] = [];
  for (const [categoryId, total] of totalByCategoryId) {
    if (total <= 0) continue;
    if (categoryId === null) {
      buckets.push({
        categoryId: null,
        name: "Sem categoria",
        color: null,
        total,
        drillable: false,
      });
      continue;
    }
    const category = byId.get(categoryId);
    if (!category) continue;
    buckets.push({
      categoryId,
      name: category.name,
      color: category.color ?? null,
      total,
      // Já é o nível mais detalhado que existe — não há pra onde descer.
      drillable: false,
    });
  }
  return buckets.sort((a, b) => b.total - a.total);
}

export type CategoryBreadcrumbStep = { id: string; name: string };

/**
 * Estado de navegação + os baldes já calculados pro nível atual — usado
 * tanto pelo card de pizza do Dashboard quanto pela listagem de Relatórios.
 *
 * Padrão é o modo "detalhado" (uma fatia por categoria-folha, sem agrupar) —
 * é o nível mais útil pra entender onde o dinheiro realmente foi. O modo
 * "agrupado" (uma fatia por categoria-mãe, com drill-down/drill-up pela
 * árvore) fica disponível como uma redução opcional, não como padrão.
 */
export function useCategoryDrilldown(categories: CategoryRow[], rows: CategoryTotalRow[]) {
  const [mode, setMode] = useState<"detailed" | "grouped">("detailed");
  const [path, setPath] = useState<CategoryBreadcrumbStep[]>([]);
  const parentId = path.length > 0 ? path[path.length - 1].id : null;

  const buckets = useMemo(() => {
    if (mode === "detailed") return categoryLeafBuckets(categories, rows);
    return categoryBucketsAt(categories, rows, parentId);
  }, [mode, categories, rows, parentId]);

  function drillInto(bucket: CategoryBucket) {
    if (!bucket.drillable || !bucket.categoryId) return;
    setPath((current) => [...current, { id: bucket.categoryId!, name: bucket.name }]);
  }
  function drillToRoot() {
    setMode("grouped");
    setPath([]);
  }
  function drillToStep(index: number) {
    setMode("grouped");
    setPath((current) => current.slice(0, index + 1));
  }
  /** Volta pro nível mais detalhado (padrão), abandonando qualquer
   *  navegação feita no modo agrupado. */
  function showDetailed() {
    setMode("detailed");
    setPath([]);
  }

  return { mode, path, buckets, drillInto, drillToRoot, drillToStep, showDetailed };
}
