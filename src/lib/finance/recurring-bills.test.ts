import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { billOccurrenceState } from "./recurring-bills";

describe("billOccurrenceState", () => {
  test("paga sempre vence, mesmo com vencimento no passado", () => {
    const state = billOccurrenceState(
      { status: "paid", due_date: "2026-01-01" },
      new Date("2026-06-01"),
    );
    assert.deepEqual(state, { label: "Paga", tone: "good" });
  });

  test("pulada é neutra, mesmo vencida", () => {
    const state = billOccurrenceState(
      { status: "skipped", due_date: "2026-01-01" },
      new Date("2026-06-01"),
    );
    assert.deepEqual(state, { label: "Pulada", tone: "neutral" });
  });

  test("pendente com vencimento futuro mostra dias restantes", () => {
    const state = billOccurrenceState(
      { status: "pending", due_date: "2026-06-10" },
      new Date("2026-06-05"),
    );
    assert.deepEqual(state, { label: "Vence em 5d", tone: "neutral" });
  });

  test("pendente vencendo hoje", () => {
    const state = billOccurrenceState(
      { status: "pending", due_date: "2026-06-05" },
      new Date("2026-06-05"),
    );
    assert.deepEqual(state, { label: "Vence hoje", tone: "warning" });
  });

  test("pendente atrasada mostra dias em atraso", () => {
    const state = billOccurrenceState(
      { status: "pending", due_date: "2026-06-01" },
      new Date("2026-06-05"),
    );
    assert.deepEqual(state, { label: "Atrasada há 4d", tone: "warning" });
  });
});
