import type { AccountKind, AccountRow } from "./types";

export type PaymentMethodHint = "debit" | "credit" | "cash" | "pix" | null;

export type PaymentAccountMatch =
  | { status: "resolved"; accountId: string; accountKind: AccountKind }
  | { status: "ambiguous"; accountKind: AccountKind | null; candidates: AccountRow[] }
  | { status: "none" };

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** "débito"/"dinheiro"/"pix" -> conta corrente; "crédito"/"cartão" -> cartão de crédito. */
export function accountKindForPaymentMethod(hint: PaymentMethodHint): AccountKind | null {
  if (hint === "debit" || hint === "cash" || hint === "pix") return "checking";
  if (hint === "credit") return "credit_card";
  return null;
}

/**
 * Resolve qual conta/cartão um lançamento de voz deve usar, a partir do que
 * a fala mencionou. Determinístico — nenhuma chamada de IA aqui, só
 * casamento de texto contra as contas já cadastradas.
 *
 * Ordem de decisão:
 * 1. Se a fala citou um nome (ex: "no Nubank"), casa contra nome/instituição
 *    das contas cadastradas — restrito ao tipo inferido pela forma de
 *    pagamento, se houver um.
 * 2. Senão, se a forma de pagamento aponta um tipo (débito/crédito/dinheiro/
 *    pix) e existe exatamente uma conta desse tipo, usa essa conta direto.
 * 3. Em qualquer outro caso (nome não bateu, ou mais de uma conta do tipo,
 *    ou nada foi dito), devolve "ambiguous"/"none" para a tela de
 *    confirmação pedir a escolha ao usuário em vez de adivinhar.
 */
export function matchPaymentAccount(
  accounts: AccountRow[],
  hints: { paymentMethodHint: PaymentMethodHint; accountNameHint: string | null },
): PaymentAccountMatch {
  const active = accounts.filter((account) => !account.archived);
  const impliedKind = accountKindForPaymentMethod(hints.paymentMethodHint);

  if (hints.accountNameHint) {
    const needle = normalize(hints.accountNameHint);
    const pool = impliedKind ? active.filter((account) => account.kind === impliedKind) : active;
    const nameMatches = pool.filter((account) => {
      const name = normalize(account.name);
      const institution = account.institution ? normalize(account.institution) : "";
      return (
        name.includes(needle) ||
        needle.includes(name) ||
        (institution && (institution.includes(needle) || needle.includes(institution)))
      );
    });
    if (nameMatches.length === 1) {
      return {
        status: "resolved",
        accountId: nameMatches[0].account_key,
        accountKind: nameMatches[0].kind,
      };
    }
    if (nameMatches.length > 1) {
      return { status: "ambiguous", accountKind: impliedKind, candidates: nameMatches };
    }
    // Name didn't match anything — fall through to kind-only resolution below.
  }

  if (impliedKind) {
    const byKind = active.filter((account) => account.kind === impliedKind);
    if (byKind.length === 1) {
      return { status: "resolved", accountId: byKind[0].account_key, accountKind: byKind[0].kind };
    }
    if (byKind.length > 1) {
      return { status: "ambiguous", accountKind: impliedKind, candidates: byKind };
    }
    return { status: "none" };
  }

  return { status: "none" };
}
