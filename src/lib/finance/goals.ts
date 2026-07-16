import type { GoalRow } from "./types";

export type GoalPaceTone = "good" | "warning" | "neutral";

export type GoalPace = {
  label: "Em andamento" | "Atingida" | "Em risco" | "Pausada" | "Encerrada";
  tone: GoalPaceTone;
};

export type GoalProgressInput = {
  /** Realizado (metas por período) ou valor atual (objetivo de longo prazo). */
  amount: number;
  /** Só para metas por período (limite de gastos, sobra, investimento) —
   *  vem de goals_realized. */
  periodStart?: string | null;
  periodEnd?: string | null;
};

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

/** Fração 0-1 do alvo já alcançado — usada direto na barra de progresso. */
export function goalProgressFraction(goal: GoalRow, amount: number): number {
  if (goal.target_amount <= 0) return 0;
  return clampFraction(amount / goal.target_amount);
}

/**
 * Indicador de ritmo por trás de cada meta. `status` manual (pausada/
 * encerrada) sempre vence. Para as demais, a heurística depende do tipo:
 * - long_term: compara % do valor-alvo já atingido com % do prazo decorrido
 *   (sem data-alvo, nunca fica "em risco" só por tempo).
 * - spending_limit: projeta o ritmo de gasto atual até o fim do período —
 *   se já ultrapassaria o limite (ou já ultrapassou), fica em risco.
 * - savings_result / investment: se o período já está >70% decorrido e o
 *   realizado ainda está bem abaixo do alvo, fica em risco.
 */
export function goalPace(
  goal: GoalRow,
  progress: GoalProgressInput,
  referenceDate: Date = new Date(),
): GoalPace {
  if (goal.status === "paused") return { label: "Pausada", tone: "neutral" };
  if (goal.status === "closed") return { label: "Encerrada", tone: "neutral" };

  if (goal.goal_type === "long_term") {
    const progressFraction = goalProgressFraction(goal, progress.amount);
    if (progressFraction >= 1) return { label: "Atingida", tone: "good" };
    if (goal.end_date) {
      const start = new Date(goal.start_date).getTime();
      const end = new Date(goal.end_date).getTime();
      const totalMs = end - start;
      const elapsedFraction =
        totalMs > 0 ? clampFraction((referenceDate.getTime() - start) / totalMs) : 0;
      if (progressFraction < elapsedFraction - 0.1) return { label: "Em risco", tone: "warning" };
    }
    return { label: "Em andamento", tone: "neutral" };
  }

  const periodStart = progress.periodStart ? new Date(progress.periodStart).getTime() : null;
  const periodEnd = progress.periodEnd ? new Date(progress.periodEnd).getTime() : null;
  const elapsedFraction =
    periodStart != null && periodEnd != null && periodEnd > periodStart
      ? clampFraction((referenceDate.getTime() - periodStart) / (periodEnd - periodStart))
      : 1;

  if (goal.goal_type === "spending_limit") {
    const projectedPaceLimit = goal.target_amount * elapsedFraction;
    if (progress.amount > goal.target_amount || progress.amount > projectedPaceLimit) {
      return { label: "Em risco", tone: "warning" };
    }
    return { label: "Em andamento", tone: "good" };
  }

  // savings_result / investment
  if (progress.amount >= goal.target_amount) return { label: "Atingida", tone: "good" };
  if (elapsedFraction > 0.7 && progress.amount < goal.target_amount * 0.7) {
    return { label: "Em risco", tone: "warning" };
  }
  return { label: "Em andamento", tone: "neutral" };
}
