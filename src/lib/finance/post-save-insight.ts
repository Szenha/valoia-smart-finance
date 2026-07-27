import { addDaysToDateOnly, dateOnlyStringToLocalDate } from "./date-utils";
import type { CategoryRow, TxnRow } from "./types";
import { formatCurrency } from "./types";

/** Uma linha de public.budget_vs_actual (supabase/migrations/
 *  20240101000013_hierarchical_budget_scopes.sql) — só os campos usados aqui. */
export type BudgetVsActualRow = {
  scope_type: string;
  category_id: string | null;
  category_name: string;
  planned_amount: number;
  actual_amount: number;
};

export type PostSaveInsight =
  | { kind: "budget_over"; message: string }
  | { kind: "budget_near"; message: string }
  | { kind: "spent_today"; message: string }
  | { kind: "spent_week"; message: string };

/** Início da semana (domingo) da data informada — mesma convenção já usada
 *  em calendario.tsx (`addDaysToDateOnly(viewDateKey, -viewDate.getDay())`),
 *  reaproveitada aqui pra manter "semana" consistente em todo o app. Não
 *  existe orçamento semanal no sistema — isso é só usado pra somar gasto
 *  factual da semana, nunca pra comparar com um "planejado semanal" que não
 *  existe. */
export function weekStartDateOnly(dateOnly: string): string {
  const local = dateOnlyStringToLocalDate(dateOnly);
  return addDaysToDateOnly(dateOnly, -local.getDay());
}

function isExpenseRow(row: Pick<TxnRow, "amount" | "type">): boolean {
  return row.amount < 0 && row.type !== "MANUAL_TRANSFER";
}

/** Soma de despesas (valor absoluto) num intervalo de datas inclusivo,
 *  excluindo transferências — mesma semântica de exclusão usada pelas RPCs
 *  de orçamento/dashboard (t.type <> 'MANUAL_TRANSFER'). */
export function sumExpensesInRange(
  transactions: Pick<TxnRow, "amount" | "type" | "posted_at">[],
  startDateOnly: string,
  endDateOnly: string,
): number {
  return transactions
    .filter((t) => {
      if (!isExpenseRow(t)) return false;
      const day = t.posted_at.slice(0, 10);
      return day >= startDateOnly && day <= endDateOnly;
    })
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
}

/** Conta quantas despesas de uma categoria (ou subcategoria dela) caem num
 *  intervalo — usado pro insight de concentração/recorrência. */
export function countExpensesInCategoryRange(
  transactions: Pick<TxnRow, "amount" | "type" | "posted_at" | "category_id">[],
  categoryIds: Set<string>,
  startDateOnly: string,
  endDateOnly: string,
): number {
  return transactions.filter((t) => {
    if (!isExpenseRow(t)) return false;
    if (!t.category_id || !categoryIds.has(t.category_id)) return false;
    const day = t.posted_at.slice(0, 10);
    return day >= startDateOnly && day <= endDateOnly;
  }).length;
}

/** Sobe a árvore de categorias a partir de categoryId, devolvendo o próprio
 *  id + todos os ancestrais — usado pra achar o orçamento que cobre essa
 *  categoria mesmo quando o orçamento foi configurado num nível acima
 *  (budget_vs_actual já rola despesas de descendentes pro category_id
 *  orçado; aqui fazemos o caminho inverso: da transação até o orçamento). */
export function categoryAncestorChain(
  categories: Pick<CategoryRow, "id" | "parent_id">[],
  categoryId: string | null,
): string[] {
  if (!categoryId) return [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  const chain: string[] = [];
  let current = byId.get(categoryId);
  let guard = 0;
  while (current && guard < 50) {
    chain.push(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
    guard += 1;
  }
  return chain;
}

function findBudgetRow(
  rows: BudgetVsActualRow[],
  categories: Pick<CategoryRow, "id" | "parent_id">[],
  categoryId: string | null,
): BudgetVsActualRow | null {
  const chain = categoryAncestorChain(categories, categoryId);
  const categoryRow = rows.find(
    (row) => row.scope_type === "category" && row.category_id && chain.includes(row.category_id),
  );
  if (categoryRow) return categoryRow;
  return rows.find((row) => row.scope_type === "macro_expense") ?? null;
}

/**
 * Escolhe no máximo UM insight pra mostrar depois de um lançamento —
 * nunca mistura vários. Ordem de prioridade (§18 do briefing):
 * 1. Orçamento mensal (só esse tem base real — não existe orçamento
 *    semanal no sistema, então "vs. planejado" nunca é semanal).
 * 2. Gasto de hoje.
 * 3. Gasto da semana (fato, sem comparação com planejado).
 * Só considera despesas — receitas não geram alerta de orçamento nem
 * "gasto hoje/semana".
 */
export function computePostSaveInsight(params: {
  savedTransaction: Pick<TxnRow, "amount" | "type" | "posted_at" | "category_id">;
  transactionType: "expense" | "income" | "transfer";
  transactions: Pick<TxnRow, "amount" | "type" | "posted_at">[];
  categories: Pick<CategoryRow, "id" | "parent_id">[];
  budgetRows: BudgetVsActualRow[];
  today: string;
}): PostSaveInsight | null {
  const { savedTransaction, transactionType, transactions, categories, budgetRows, today } = params;
  if (transactionType !== "expense") return null;

  const budgetRow = findBudgetRow(budgetRows, categories, savedTransaction.category_id);
  if (budgetRow && budgetRow.planned_amount > 0) {
    const ratio = budgetRow.actual_amount / budgetRow.planned_amount;
    const pct = Math.round(ratio * 100);
    if (ratio >= 1) {
      return {
        kind: "budget_over",
        message: `Você já ultrapassou o orçamento mensal de ${budgetRow.category_name}: ${formatCurrency(budgetRow.actual_amount)} de ${formatCurrency(budgetRow.planned_amount)} planejados (${pct}%).`,
      };
    }
    if (ratio >= 0.9) {
      return {
        kind: "budget_near",
        message: `Você está perto do limite mensal de ${budgetRow.category_name}: ${pct}% já utilizado.`,
      };
    }
  }

  const spentToday = sumExpensesInRange(transactions, today, today);
  if (spentToday > 0) {
    return { kind: "spent_today", message: `Você gastou ${formatCurrency(spentToday)} hoje.` };
  }

  const weekStart = weekStartDateOnly(today);
  const spentWeek = sumExpensesInRange(transactions, weekStart, today);
  if (spentWeek > 0) {
    return {
      kind: "spent_week",
      message: `Você gastou ${formatCurrency(spentWeek)} nesta semana.`,
    };
  }

  return null;
}
