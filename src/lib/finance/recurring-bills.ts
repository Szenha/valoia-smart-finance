import type { RecurringBillOccurrenceRow } from "./types";

export type BillOccurrenceTone = "good" | "warning" | "neutral";

export type BillOccurrenceState = {
  label: string;
  tone: BillOccurrenceTone;
};

function dayKey(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysUntil(referenceDate: Date, targetDate: Date): number {
  return Math.round((dayKey(targetDate) - dayKey(referenceDate)) / 86_400_000);
}

/**
 * Estado de exibição de uma ocorrência de conta fixa. `status` persistido
 * (paid/skipped) sempre vence; para `pending`, o atraso é calculado na
 * leitura comparando due_date com referenceDate — não existe um estado
 * "atrasada" gravado no banco, então isso nunca fica desatualizado à espera
 * de um job.
 */
export function billOccurrenceState(
  occurrence: Pick<RecurringBillOccurrenceRow, "status" | "due_date">,
  referenceDate: Date = new Date(),
): BillOccurrenceState {
  if (occurrence.status === "paid") return { label: "Paga", tone: "good" };
  if (occurrence.status === "skipped") return { label: "Pulada", tone: "neutral" };

  const diff = daysUntil(referenceDate, new Date(occurrence.due_date));
  if (diff < 0) return { label: `Atrasada há ${Math.abs(diff)}d`, tone: "warning" };
  if (diff === 0) return { label: "Vence hoje", tone: "warning" };
  return { label: `Vence em ${diff}d`, tone: "neutral" };
}
