import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { goalPace, goalProgressFraction } from "./goals";
import type { GoalRow } from "./types";

function goal(overrides: Partial<GoalRow>): GoalRow {
  return {
    id: "goal-1",
    goal_type: "spending_limit",
    name: "Meta",
    description: null,
    status: "active",
    period_type: "monthly",
    target_amount: 1000,
    initial_amount: null,
    current_amount: null,
    monthly_contribution: null,
    estimated_return_rate: null,
    start_date: "2026-01-01",
    end_date: null,
    account_id: null,
    category_id: null,
    auto_tracked: true,
    created_by: null,
    archived: false,
    ...overrides,
  };
}

describe("goalProgressFraction", () => {
  test("fração normal fica entre 0 e 1", () => {
    assert.equal(goalProgressFraction(goal({ target_amount: 1000 }), 500), 0.5);
  });

  test("nunca ultrapassa 1 mesmo passando do alvo", () => {
    assert.equal(goalProgressFraction(goal({ target_amount: 1000 }), 5000), 1);
  });

  test("nunca fica negativa", () => {
    assert.equal(goalProgressFraction(goal({ target_amount: 1000 }), -50), 0);
  });

  test("alvo zero não divide por zero", () => {
    assert.equal(goalProgressFraction(goal({ target_amount: 0 }), 100), 0);
  });
});

describe("goalPace", () => {
  test("status pausada/encerrada sempre vence, mesmo estourando o limite", () => {
    const paused = goal({ status: "paused", target_amount: 1000 });
    assert.deepEqual(goalPace(paused, { amount: 9999 }), { label: "Pausada", tone: "neutral" });
    const closed = goal({ status: "closed", target_amount: 1000 });
    assert.deepEqual(goalPace(closed, { amount: 9999 }), { label: "Encerrada", tone: "neutral" });
  });

  describe("limite de gastos", () => {
    test("dentro do ritmo esperado no meio do período", () => {
      const g = goal({ goal_type: "spending_limit", target_amount: 1000 });
      const pace = goalPace(
        g,
        { amount: 400, periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        new Date("2026-01-15"),
      );
      assert.equal(pace.label, "Em andamento");
      assert.equal(pace.tone, "good");
    });

    test("gastando rápido demais para o ritmo do período fica em risco", () => {
      const g = goal({ goal_type: "spending_limit", target_amount: 1000 });
      // 900 gastos com só ~16% do período decorrido — ritmo vai estourar.
      const pace = goalPace(
        g,
        { amount: 900, periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        new Date("2026-01-05"),
      );
      assert.equal(pace.label, "Em risco");
      assert.equal(pace.tone, "warning");
    });

    test("já estourou o limite fica em risco mesmo no fim do período", () => {
      const g = goal({ goal_type: "spending_limit", target_amount: 1000 });
      const pace = goalPace(
        g,
        { amount: 1200, periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        new Date("2026-01-30"),
      );
      assert.equal(pace.label, "Em risco");
    });
  });

  describe("sobra do período / investimento", () => {
    test("já atingiu o alvo", () => {
      const g = goal({ goal_type: "savings_result", target_amount: 3000 });
      const pace = goalPace(
        g,
        { amount: 3200, periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        new Date("2026-01-20"),
      );
      assert.equal(pace.label, "Atingida");
      assert.equal(pace.tone, "good");
    });

    test("período quase no fim e longe do alvo fica em risco", () => {
      const g = goal({ goal_type: "investment", target_amount: 2000 });
      const pace = goalPace(
        g,
        { amount: 500, periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        new Date("2026-01-28"),
      );
      assert.equal(pace.label, "Em risco");
    });

    test("início do período, ainda longe do alvo, não é risco ainda", () => {
      const g = goal({ goal_type: "investment", target_amount: 2000 });
      const pace = goalPace(
        g,
        { amount: 100, periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        new Date("2026-01-03"),
      );
      assert.equal(pace.label, "Em andamento");
    });
  });

  describe("objetivo de longo prazo", () => {
    test("progresso igual ou maior que o alvo é atingida", () => {
      const g = goal({
        goal_type: "long_term",
        target_amount: 500000,
        start_date: "2020-01-01",
        end_date: "2035-12-31",
      });
      assert.equal(goalPace(g, { amount: 500000 }).label, "Atingida");
    });

    test("progresso muito atrás do tempo decorrido fica em risco", () => {
      const g = goal({
        goal_type: "long_term",
        target_amount: 100000,
        start_date: "2020-01-01",
        end_date: "2030-01-01",
      });
      // Metade do prazo já passou (2025), mas só 10% do valor foi juntado.
      const pace = goalPace(g, { amount: 10000 }, new Date("2025-01-01"));
      assert.equal(pace.label, "Em risco");
    });

    test("sem data-alvo não fica em risco só por causa do tempo", () => {
      const g = goal({
        goal_type: "long_term",
        target_amount: 100000,
        start_date: "2020-01-01",
        end_date: null,
      });
      const pace = goalPace(g, { amount: 1000 }, new Date("2030-01-01"));
      assert.equal(pace.label, "Em andamento");
    });
  });
});
