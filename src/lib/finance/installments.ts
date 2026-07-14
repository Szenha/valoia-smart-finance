// Fonte única de cálculo de parcelamento — usada tanto pelo formulário
// manual quanto pelo fluxo de voz (QuickAddForm.tsx), para que as duas
// origens de dado sigam exatamente a mesma regra de negócio.

export type InstallmentSchedule = {
  number: number;
  amount: number;
  postedAt: string;
};

/**
 * Divide um valor total em N parcelas cujo somatório bate exatamente com o
 * total, mesmo quando a divisão não é exata (ex: 100 / 3). O resto em
 * centavos é distribuído uma unidade por vez, começando pela primeira
 * parcela — 100/3 vira 33,34 + 33,33 + 33,33, nunca 33,33 x3 com diferença
 * perdida.
 */
export function splitInstallmentAmounts(totalAmount: number, totalInstallments: number): number[] {
  if (totalInstallments < 1) throw new Error("totalInstallments deve ser >= 1");
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / totalInstallments);
  const remainderCents = totalCents - baseCents * totalInstallments;
  return Array.from(
    { length: totalInstallments },
    (_, index) => (baseCents + (index < remainderCents ? 1 : 0)) / 100,
  );
}

function clampDayInMonth(year: number, monthIndex0: number, day: number): Date {
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  return new Date(year, monthIndex0, Math.min(day, daysInMonth));
}

/**
 * Mês de competência (fatura) em que uma compra cai, dado o dia de
 * fechamento do cartão: se a compra foi feita depois do fechamento, ela cai
 * na fatura do mês seguinte; senão, na fatura do mês corrente. Mesma regra
 * usada em `public.competence_month` no banco (supabase/migrations/
 * 20240101000014_account_card_details.sql) — mantidas em paralelo porque
 * uma roda no navegador (para agendar as parcelas antes de gravar) e a
 * outra no banco (para relatórios sobre dados já gravados).
 */
export function competenceMonthForPurchase(
  purchaseDate: Date,
  closingDay: number | null | undefined,
): { year: number; monthIndex0: number } {
  const day = purchaseDate.getDate();
  let year = purchaseDate.getFullYear();
  let monthIndex0 = purchaseDate.getMonth();
  if (closingDay != null && day > closingDay) {
    monthIndex0 += 1;
    if (monthIndex0 > 11) {
      monthIndex0 = 0;
      year += 1;
    }
  }
  return { year, monthIndex0 };
}

/**
 * Agenda completa de uma compra parcelada: valor e data (competência) de
 * cada parcela, respeitando o fechamento do cartão. `closingDay` nulo (conta
 * corrente, ou cartão sem fechamento cadastrado) trata cada parcela como
 * caindo no mês corrente a partir da data da compra, sem deslocamento.
 */
export function computeInstallmentSchedule(
  purchaseDate: Date,
  totalAmount: number,
  totalInstallments: number,
  closingDay: number | null | undefined,
): InstallmentSchedule[] {
  const amounts = splitInstallmentAmounts(totalAmount, totalInstallments);
  const base = competenceMonthForPurchase(purchaseDate, closingDay);
  const day = purchaseDate.getDate();
  return amounts.map((amount, index) => {
    let monthIndex0 = base.monthIndex0 + index;
    let year = base.year;
    while (monthIndex0 > 11) {
      monthIndex0 -= 12;
      year += 1;
    }
    const date = clampDayInMonth(year, monthIndex0, day);
    return {
      number: index + 1,
      amount,
      postedAt: date.toISOString().slice(0, 10),
    };
  });
}
