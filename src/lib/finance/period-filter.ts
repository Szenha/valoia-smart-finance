import {
  addDaysToDateOnly,
  addMonthsToDateOnly,
  localToday,
  startOfMonthDateOnly,
} from "./date-utils";

export type PeriodFilter = "this_month" | "last_month" | "last_3_months" | "this_year" | "all";

export const PERIOD_LABEL: Record<PeriodFilter, string> = {
  this_month: "Este mês",
  last_month: "Mês passado",
  last_3_months: "Últimos 3 meses",
  this_year: "Este ano",
  all: "Todo o período",
};

/** Início/fim (inclusive) do período selecionado, como "YYYY-MM-DD" — `null`
 *  para "all" (sem recorte). Padrão em todas as telas que usam isso é o mês
 *  corrente, nunca "últimos N dias". */
export function periodBounds(period: PeriodFilter): { start: string; end: string } | null {
  const today = localToday();
  if (period === "all") return null;
  if (period === "this_month") return { start: startOfMonthDateOnly(today), end: today };
  if (period === "last_month") {
    const start = startOfMonthDateOnly(addMonthsToDateOnly(today, -1));
    const end = addDaysToDateOnly(startOfMonthDateOnly(today), -1);
    return { start, end };
  }
  if (period === "last_3_months") {
    return { start: startOfMonthDateOnly(addMonthsToDateOnly(today, -2)), end: today };
  }
  return { start: `${today.slice(0, 4)}-01-01`, end: today };
}
