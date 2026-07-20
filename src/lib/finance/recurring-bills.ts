import { daysUntilDateOnly, localToday } from "./date-utils";
import type { RecurringBillOccurrenceRow } from "./types";

export type BillOccurrenceTone = "good" | "warning" | "neutral";

export type BillOccurrenceState = {
  label: string;
  tone: BillOccurrenceTone;
};

/**
 * Estado de exibição de uma ocorrência de conta fixa. `status` persistido
 * (paid/skipped) sempre vence; para `pending`, o atraso é calculado na
 * leitura comparando due_date com referenceDate — não existe um estado
 * "atrasada" gravado no banco, então isso nunca fica desatualizado à espera
 * de um job. `referenceDate` é uma string "YYYY-MM-DD" (não um Date) para
 * nunca sofrer o deslocamento de fuso horário de `new Date(str)` + getters
 * locais — ver src/lib/finance/date-utils.ts.
 */
export function billOccurrenceState(
  occurrence: Pick<RecurringBillOccurrenceRow, "status" | "due_date">,
  referenceDate: string = localToday(),
): BillOccurrenceState {
  if (occurrence.status === "paid") return { label: "Paga", tone: "good" };
  if (occurrence.status === "skipped") return { label: "Pulada", tone: "neutral" };

  const diff = daysUntilDateOnly(referenceDate, occurrence.due_date);
  if (diff < 0) return { label: `Atrasada há ${Math.abs(diff)}d`, tone: "warning" };
  if (diff === 0) return { label: "Vence hoje", tone: "warning" };
  return { label: `Vence em ${diff}d`, tone: "neutral" };
}
