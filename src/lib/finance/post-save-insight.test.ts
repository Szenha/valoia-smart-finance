import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  categoryAncestorChain,
  computePostSaveInsight,
  countExpensesInCategoryRange,
  sumExpensesInRange,
  weekStartDateOnly,
  type BudgetVsActualRow,
} from "./post-save-insight";
import type { CategoryRow, TxnRow } from "./types";

function txn(
  overrides: Partial<TxnRow>,
): Pick<TxnRow, "amount" | "type" | "posted_at" | "category_id"> {
  return {
    amount: -10,
    type: "MANUAL_DEBIT",
    posted_at: "2026-07-27T00:00:00.000Z",
    category_id: null,
    ...overrides,
  };
}

function category(overrides: Partial<CategoryRow>): CategoryRow {
  return {
    id: "id",
    name: "Categoria",
    type: "expense",
    parent_id: null,
    ...overrides,
  };
}

describe("weekStartDateOnly", () => {
  test("domingo é o início da própria semana", () => {
    // 2026-07-26 é um domingo.
    assert.equal(weekStartDateOnly("2026-07-26"), "2026-07-26");
  });

  test("segunda-feira volta pro domingo anterior", () => {
    // 2026-07-27 é uma segunda-feira.
    assert.equal(weekStartDateOnly("2026-07-27"), "2026-07-26");
  });

  test("sábado volta pro domingo da mesma semana", () => {
    // 2026-08-01 é um sábado.
    assert.equal(weekStartDateOnly("2026-08-01"), "2026-07-26");
  });
});

describe("sumExpensesInRange", () => {
  test("soma só despesas (amount negativo) dentro do intervalo", () => {
    const transactions = [
      txn({ amount: -50, posted_at: "2026-07-27T00:00:00.000Z" }),
      txn({ amount: -30, posted_at: "2026-07-26T00:00:00.000Z" }),
      txn({ amount: -20, posted_at: "2026-07-20T00:00:00.000Z" }), // fora do intervalo
      txn({ amount: 100, posted_at: "2026-07-27T00:00:00.000Z" }), // receita, não conta
    ];
    assert.equal(sumExpensesInRange(transactions, "2026-07-26", "2026-07-27"), 80);
  });

  test("ignora transferências mesmo com amount negativo", () => {
    const transactions = [
      txn({ amount: -50, type: "MANUAL_TRANSFER", posted_at: "2026-07-27T00:00:00.000Z" }),
    ];
    assert.equal(sumExpensesInRange(transactions, "2026-07-27", "2026-07-27"), 0);
  });
});

describe("countExpensesInCategoryRange", () => {
  test("conta lançamentos cuja categoria está no conjunto informado", () => {
    const transactions = [
      txn({ amount: -10, category_id: "alimentacao", posted_at: "2026-07-27T00:00:00.000Z" }),
      txn({ amount: -10, category_id: "alimentacao", posted_at: "2026-07-26T00:00:00.000Z" }),
      txn({ amount: -10, category_id: "transporte", posted_at: "2026-07-27T00:00:00.000Z" }),
    ];
    assert.equal(
      countExpensesInCategoryRange(
        transactions,
        new Set(["alimentacao"]),
        "2026-07-26",
        "2026-07-27",
      ),
      2,
    );
  });
});

describe("categoryAncestorChain", () => {
  test("sobe do filho até a raiz", () => {
    const categories = [
      category({ id: "alimentacao", parent_id: null }),
      category({ id: "restaurante", parent_id: "alimentacao" }),
    ];
    assert.deepEqual(categoryAncestorChain(categories, "restaurante"), [
      "restaurante",
      "alimentacao",
    ]);
  });

  test("categoria nula não gera cadeia", () => {
    assert.deepEqual(categoryAncestorChain([], null), []);
  });
});

describe("computePostSaveInsight — prioridade e regras", () => {
  const categories = [
    category({ id: "alimentacao", parent_id: null }),
    category({ id: "restaurante", parent_id: "alimentacao" }),
  ];

  test("receita nunca gera insight (nem orçamento, nem gasto do dia)", () => {
    const result = computePostSaveInsight({
      savedTransaction: txn({ amount: 100, category_id: "alimentacao" }),
      transactionType: "income",
      transactions: [txn({ amount: -500, category_id: "alimentacao" })],
      categories,
      budgetRows: [],
      today: "2026-07-27",
    });
    assert.equal(result, null);
  });

  test("orçamento estourado tem prioridade sobre gasto do dia", () => {
    const budgetRows: BudgetVsActualRow[] = [
      {
        scope_type: "category",
        category_id: "alimentacao",
        category_name: "Alimentação",
        planned_amount: 100,
        actual_amount: 150,
      },
    ];
    const result = computePostSaveInsight({
      savedTransaction: txn({ amount: -50, category_id: "restaurante" }),
      transactionType: "expense",
      transactions: [txn({ amount: -50, category_id: "restaurante" })],
      categories,
      budgetRows,
      today: "2026-07-27",
    });
    assert.equal(result?.kind, "budget_over");
  });

  test("orçamento aplicado no pai cobre a subcategoria filha", () => {
    const budgetRows: BudgetVsActualRow[] = [
      {
        scope_type: "category",
        category_id: "alimentacao",
        category_name: "Alimentação",
        planned_amount: 100,
        actual_amount: 95,
      },
    ];
    const result = computePostSaveInsight({
      savedTransaction: txn({ amount: -50, category_id: "restaurante" }),
      transactionType: "expense",
      transactions: [],
      categories,
      budgetRows,
      today: "2026-07-27",
    });
    assert.equal(result?.kind, "budget_near");
  });

  test("sem orçamento configurado, nunca inventa 'dentro do planejado' — cai pro gasto do dia", () => {
    const result = computePostSaveInsight({
      savedTransaction: txn({ amount: -50, category_id: "restaurante" }),
      transactionType: "expense",
      transactions: [
        txn({ amount: -50, category_id: "restaurante", posted_at: "2026-07-27T00:00:00.000Z" }),
      ],
      categories,
      budgetRows: [],
      today: "2026-07-27",
    });
    assert.equal(result?.kind, "spent_today");
  });

  test("sem gasto hoje, cai pro gasto da semana", () => {
    const result = computePostSaveInsight({
      savedTransaction: txn({
        amount: -50,
        category_id: "restaurante",
        posted_at: "2026-07-26T00:00:00.000Z",
      }),
      transactionType: "expense",
      transactions: [
        txn({ amount: -50, category_id: "restaurante", posted_at: "2026-07-26T00:00:00.000Z" }),
      ],
      categories,
      budgetRows: [],
      today: "2026-07-27",
    });
    assert.equal(result?.kind, "spent_week");
  });

  test("sem orçamento nem gasto no período, não retorna insight nenhum", () => {
    const result = computePostSaveInsight({
      savedTransaction: txn({
        amount: -50,
        category_id: "restaurante",
        posted_at: "2026-06-01T00:00:00.000Z",
      }),
      transactionType: "expense",
      transactions: [],
      categories,
      budgetRows: [],
      today: "2026-07-27",
    });
    assert.equal(result, null);
  });
});
