import type { AccountRow, TxnRow } from "./types";

export type SplitMode = "percentage" | "weight";

export type MemberShareInput = {
  memberId: string;
  /** Percentual (soma deve dar 100) no modo "percentage", ou peso/partes
   *  relativo no modo "weight" (não precisa somar nada específico). */
  share: number;
};

export type MemberSplitResult = {
  memberId: string;
  /** Sempre normalizado pra percentual, mesmo quando a entrada foi por peso. */
  participationPercent: number;
  shouldPayCents: number;
  paidCents: number;
  /** paidCents - shouldPayCents: positivo = tem a receber, negativo = tem a pagar. */
  balanceCents: number;
};

export type SettlementTransfer = {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
};

export function toCents(amountInReais: number): number {
  return Math.round(amountInReais * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Quem pagou uma transação, na ordem de confiança pedida: cartão adicional
 * (spent_by_member_id, o sinal mais específico), depois o titular da conta/
 * cartão usado, depois quem lançou o registro. `null` = pagador não
 * identificado — a tela pede definição manual antes de fechar o rateio.
 */
export function resolvePayer(
  transaction: Pick<TxnRow, "spent_by_member_id" | "created_by" | "account_id">,
  accounts: AccountRow[],
): string | null {
  if (transaction.spent_by_member_id) return transaction.spent_by_member_id;
  const account = accounts.find((a) => a.account_key === transaction.account_id);
  if (account?.owner_user_id) return account.owner_user_id;
  if (transaction.created_by) return transaction.created_by;
  return null;
}

/** Converte a entrada (percentual ou peso) num percentual 0-100 por membro. */
export function normalizeShares(members: MemberShareInput[], mode: SplitMode): Map<string, number> {
  if (mode === "percentage") {
    return new Map(members.map((member) => [member.memberId, member.share]));
  }
  const totalWeight = members.reduce((sum, member) => sum + member.share, 0);
  if (totalWeight <= 0) {
    return new Map(members.map((member) => [member.memberId, 0]));
  }
  return new Map(members.map((member) => [member.memberId, (member.share / totalWeight) * 100]));
}

/**
 * Divide o total (em centavos) entre os membros conforme a participação de
 * cada um, e cruza com quanto cada um efetivamente pagou. Corrige o resto do
 * arredondamento centavo a centavo (maior participação primeiro) pra garantir
 * que a soma do "deveria pagar" bate exatamente com o total.
 */
export function calculateExpenseSplit(
  totalCents: number,
  members: MemberShareInput[],
  mode: SplitMode,
  paidByCents: Map<string, number>,
): MemberSplitResult[] {
  const percentByMember = normalizeShares(members, mode);
  const ids = members.map((member) => member.memberId);
  const shouldPay = ids.map((id) =>
    Math.round((totalCents * (percentByMember.get(id) ?? 0)) / 100),
  );

  let roundingDiff = totalCents - shouldPay.reduce((sum, value) => sum + value, 0);
  const byDescendingShare = ids
    .map((id, index) => ({ index, pct: percentByMember.get(id) ?? 0 }))
    .sort((a, b) => b.pct - a.pct);

  let cursor = 0;
  while (roundingDiff !== 0 && byDescendingShare.length > 0) {
    const target = byDescendingShare[cursor % byDescendingShare.length].index;
    shouldPay[target] += roundingDiff > 0 ? 1 : -1;
    roundingDiff += roundingDiff > 0 ? -1 : 1;
    cursor++;
  }

  return ids.map((id, index) => {
    const paidCents = paidByCents.get(id) ?? 0;
    return {
      memberId: id,
      participationPercent: percentByMember.get(id) ?? 0,
      shouldPayCents: shouldPay[index],
      paidCents,
      balanceCents: paidCents - shouldPay[index],
    };
  });
}

/**
 * Sugestão de compensação minimizando o número de transferências: maior
 * credor recebe do maior devedor até um dos dois zerar, repete.
 */
export function simplifySettlements(results: MemberSplitResult[]): SettlementTransfer[] {
  const creditors = results
    .filter((result) => result.balanceCents > 0)
    .map((result) => ({ id: result.memberId, amount: result.balanceCents }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = results
    .filter((result) => result.balanceCents < 0)
    .map((result) => ({ id: result.memberId, amount: -result.balanceCents }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: SettlementTransfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) {
      transfers.push({
        fromMemberId: debtors[i].id,
        toMemberId: creditors[j].id,
        amountCents: amount,
      });
    }
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return transfers;
}
