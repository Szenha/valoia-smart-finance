// Utilitários de data compartilhados para evitar o erro mais comum deste
// projeto: `new Date("YYYY-MM-DD")` é interpretado como meia-noite UTC, e
// lê-lo de volta com getters LOCAIS (getDate/getMonth/getFullYear,
// toLocaleDateString) desloca a data em -1 dia em fusos negativos como o
// Brasil (UTC-3). As funções abaixo nunca misturam as duas semânticas:
// - *DateOnly (e localToday/formatDateBR) tratam a data como string pura,
//   sem nunca ler um Date com getters locais.
// - dateOnlyStringToLocalDate/startOfCurrentLocalMonth produzem um Date
//   com semântica LOCAL, para os poucos consumidores (ex: installments.ts)
//   que precisam de um objeto Date de verdade.

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Data de hoje no fuso local do usuário, como "YYYY-MM-DD". */
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * Formata uma data ou timestamp ("YYYY-MM-DD" ou timestamptz ISO) como
 * "dd/mm/yyyy" sem nunca construir um Date — evita qualquer conversão de
 * fuso horário.
 */
export function formatDateBR(value: string | null | undefined): string {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
}

function parseDateOnlyUTC(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
}

function formatDateOnlyUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Soma (ou subtrai) dias a uma data "YYYY-MM-DD", sem deslocamento de fuso. */
export function addDaysToDateOnly(dateStr: string, days: number): string {
  const date = parseDateOnlyUTC(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnlyUTC(date);
}

/** Soma (ou subtrai) meses a uma data "YYYY-MM-DD", sem deslocamento de fuso. */
export function addMonthsToDateOnly(dateStr: string, months: number): string {
  const date = parseDateOnlyUTC(dateStr);
  date.setUTCMonth(date.getUTCMonth() + months);
  return formatDateOnlyUTC(date);
}

/** Primeiro dia do mês de uma data "YYYY-MM-DD", sem deslocamento de fuso. */
export function startOfMonthDateOnly(dateStr: string): string {
  const [year, month] = dateStr.slice(0, 10).split("-");
  return `${year}-${month}-01`;
}

/** Diferença em meses inteiros entre duas datas "YYYY-MM-DD" (end - start). */
export function monthsBetweenDateOnly(startStr: string, endStr: string): number {
  const start = parseDateOnlyUTC(startStr);
  const end = parseDateOnlyUTC(endStr);
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth())
  );
}

/** Diferença em dias entre duas datas "YYYY-MM-DD" (to - from). */
export function daysUntilDateOnly(fromStr: string, toStr: string): number {
  const from = parseDateOnlyUTC(fromStr);
  const to = parseDateOnlyUTC(toStr);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Converte "YYYY-MM-DD" em um Date com semântica LOCAL (meia-noite local,
 * não UTC) — para consumidores que precisam de getters locais consistentes,
 * como `computeInstallmentSchedule`.
 */
export function dateOnlyStringToLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Primeiro dia do mês corrente como Date local, sem round-trip por string. */
export function startOfCurrentLocalMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
