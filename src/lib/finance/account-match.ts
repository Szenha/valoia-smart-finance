import type { AccountKind, AccountRow, AdditionalCardRow } from "./types";

export type PaymentMethodHint = "debit" | "credit" | "cash" | "pix" | null;

export type PaymentAccountMatch =
  | {
      status: "resolved";
      accountId: string;
      accountKind: AccountKind;
      additionalCardId: string | null;
    }
  | { status: "ambiguous"; accountKind: AccountKind | null; candidates: AccountRow[] }
  | { status: "none" };

/**
 * A selectable payment option — either a real account/card, or an
 * additional card, which inherits its account_id/kind from the parent
 * (transactions posted through it consume the same shared limit) and
 * carries the assigned member as its "owner" for matching/grouping.
 */
export type PaymentOption = {
  accountId: string;
  accountKind: AccountKind;
  additionalCardId: string | null;
  ownerId: string;
  account: AccountRow;
  label: string | null;
};

export function buildPaymentOptions(
  accounts: AccountRow[],
  additionalCards: AdditionalCardRow[],
): PaymentOption[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const options: PaymentOption[] = accounts.map((account) => ({
    accountId: account.account_key,
    accountKind: account.kind,
    additionalCardId: null,
    ownerId: account.owner_user_id,
    account,
    label: null,
  }));
  for (const holder of additionalCards) {
    if (holder.archived) continue;
    const parent = accountById.get(holder.financial_account_id);
    if (!parent) continue;
    options.push({
      accountId: parent.account_key,
      accountKind: parent.kind,
      additionalCardId: holder.id,
      ownerId: holder.member_user_id,
      account: parent,
      label: holder.label,
    });
  }
  return options;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** "débito"/"dinheiro"/"pix" -> conta corrente; "crédito"/"cartão" -> cartão de crédito. */
export function accountKindForPaymentMethod(hint: PaymentMethodHint): AccountKind | null {
  if (hint === "debit" || hint === "cash" || hint === "pix") return "checking";
  if (hint === "credit") return "credit_card";
  return null;
}

/** Collapses payment options back down to their underlying accounts,
 *  de-duplicated — an additional card and its parent both point at the
 *  same account, so "ambiguous" candidates shouldn't list it twice. */
function dedupeAccounts(options: PaymentOption[]): AccountRow[] {
  const byId = new Map<string, AccountRow>();
  for (const option of options) byId.set(option.account.id, option.account);
  return Array.from(byId.values());
}

/** When more than one option still matches, prefer whichever is "owned" by
 *  the person currently logged in — this is how "cartão adicional" gets
 *  resolved without any extra parsing: if she's the one talking, her own
 *  card (principal or additional) wins; if I am, mine does. Only narrows
 *  down when it resolves to exactly one; otherwise leaves the ambiguity for
 *  the confirmation screen to ask the user directly. */
function preferCurrentUser(
  candidates: PaymentOption[],
  currentUserId: string | null,
): PaymentOption[] {
  if (!currentUserId) return candidates;
  const mine = candidates.filter((option) => option.ownerId === currentUserId);
  return mine.length === 1 ? mine : candidates;
}

/**
 * Resolve qual conta/cartão (ou cartão adicional) um lançamento de voz deve
 * usar, a partir do que a fala mencionou. Determinístico — nenhuma chamada
 * de IA aqui, só casamento de texto contra as contas/cartões adicionais já
 * cadastrados.
 *
 * Ordem de decisão:
 * 1. Se a fala citou um nome (ex: "no Nubank", "no Visa"), casa contra
 *    nome/instituição da conta ou o apelido do cartão adicional — restrito
 *    ao tipo inferido pela forma de pagamento, se houver um. Mais de uma
 *    batida (ex: principal e adicional do mesmo cartão) é desempatada pelo
 *    usuário logado antes de desistir.
 * 2. Senão, se a forma de pagamento aponta um tipo (débito/crédito/dinheiro/
 *    pix) e existe exatamente uma opção desse tipo (já desempatando pelo
 *    usuário logado), usa essa direto.
 * 3. Em qualquer outro caso, devolve "ambiguous"/"none" para a tela de
 *    confirmação pedir a escolha ao usuário em vez de adivinhar.
 */
export function matchPaymentAccount(
  accounts: AccountRow[],
  additionalCards: AdditionalCardRow[],
  hints: { paymentMethodHint: PaymentMethodHint; accountNameHint: string | null },
  currentUserId: string | null,
): PaymentAccountMatch {
  const options = buildPaymentOptions(accounts, additionalCards).filter(
    (option) => !option.account.archived,
  );
  const impliedKind = accountKindForPaymentMethod(hints.paymentMethodHint);

  if (hints.accountNameHint) {
    const needle = normalize(hints.accountNameHint);
    const pool = impliedKind
      ? options.filter((option) => option.accountKind === impliedKind)
      : options;
    let nameMatches = pool.filter((option) => {
      const name = normalize(option.account.name);
      const institution = option.account.institution ? normalize(option.account.institution) : "";
      const label = option.label ? normalize(option.label) : "";
      return (
        name.includes(needle) ||
        needle.includes(name) ||
        (institution && (institution.includes(needle) || needle.includes(institution))) ||
        (label && (label.includes(needle) || needle.includes(label)))
      );
    });
    if (nameMatches.length > 1) nameMatches = preferCurrentUser(nameMatches, currentUserId);
    if (nameMatches.length === 1) {
      return {
        status: "resolved",
        accountId: nameMatches[0].accountId,
        accountKind: nameMatches[0].accountKind,
        additionalCardId: nameMatches[0].additionalCardId,
      };
    }
    if (nameMatches.length > 1) {
      return {
        status: "ambiguous",
        accountKind: impliedKind,
        candidates: dedupeAccounts(nameMatches),
      };
    }
    // Name didn't match anything — fall through to kind-only resolution below.
  }

  if (impliedKind) {
    let byKind = options.filter((option) => option.accountKind === impliedKind);
    if (byKind.length > 1) byKind = preferCurrentUser(byKind, currentUserId);
    if (byKind.length === 1) {
      return {
        status: "resolved",
        accountId: byKind[0].accountId,
        accountKind: byKind[0].accountKind,
        additionalCardId: byKind[0].additionalCardId,
      };
    }
    if (byKind.length > 1) {
      return { status: "ambiguous", accountKind: impliedKind, candidates: dedupeAccounts(byKind) };
    }
    return { status: "none" };
  }

  return { status: "none" };
}
