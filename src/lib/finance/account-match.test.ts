import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  accountKindForPaymentMethod,
  matchPaymentAccount,
  resolvePaymentMethod,
} from "./account-match";
import type { AccountRow, AdditionalCardRow } from "./types";

function account(overrides: Partial<AccountRow>): AccountRow {
  return {
    id: overrides.account_key ?? "id",
    account_key: "key",
    name: "Conta",
    institution: null,
    kind: "checking",
    archived: false,
    initial_balance: null,
    initial_balance_date: null,
    closing_day: null,
    due_day: null,
    credit_limit: null,
    owner_user_id: "owner",
    is_primary: false,
    ...overrides,
  };
}

function additionalCard(overrides: Partial<AdditionalCardRow>): AdditionalCardRow {
  return {
    id: "holder-1",
    financial_account_id: "1",
    member_user_id: "member",
    label: null,
    archived: false,
    ...overrides,
  };
}

describe("accountKindForPaymentMethod", () => {
  test("débito/dinheiro/pix apontam para conta corrente", () => {
    assert.equal(accountKindForPaymentMethod("debit"), "checking");
    assert.equal(accountKindForPaymentMethod("cash"), "checking");
    assert.equal(accountKindForPaymentMethod("pix"), "checking");
  });

  test("crédito aponta para cartão de crédito", () => {
    assert.equal(accountKindForPaymentMethod("credit"), "credit_card");
  });

  test("sem forma de pagamento não infere nada", () => {
    assert.equal(accountKindForPaymentMethod(null), null);
  });
});

describe("resolvePaymentMethod", () => {
  // Regressão do bug: "Gastei 50 reais no Pix" / "Paguei 80 via Pix" / "Fiz
  // um Pix de 120 reais" — todas essas falas produzem payment_method_hint
  // "pix", e accountKindForPaymentMethod("pix") resolve pra "checking" (mesma
  // conta corrente que débito e dinheiro usam). O bug estava em re-derivar
  // payment_method só a partir de accountKind "checking", que sempre colapsa
  // pra "debit" — resolvePaymentMethod precisa preservar o hint original.
  test("Pix falado é preservado como 'pix', não vira 'debit'", () => {
    assert.equal(resolvePaymentMethod("pix", "checking"), "pix");
  });

  test("dinheiro falado é preservado como 'cash', não vira 'debit'", () => {
    assert.equal(resolvePaymentMethod("cash", "checking"), "cash");
  });

  test("débito falado permanece 'debit'", () => {
    assert.equal(resolvePaymentMethod("debit", "checking"), "debit");
  });

  // "Gastei 50 reais no crédito" / "Paguei no cartão de crédito" / "Comprei
  // em três vezes no cartão" / "Paguei no cartão Nubank" — o hint "credit" é
  // extraído pelo prompt a partir do contexto (verbos como "gastei" /
  // "paguei" / "passei" + "crédito"/"cartão"), nunca por palavra-chave
  // isolada; aqui testamos só que, dado o hint já extraído, a resolução pro
  // enum persistido está correta.
  test("crédito falado vira 'credit_card'", () => {
    assert.equal(resolvePaymentMethod("credit", "credit_card"), "credit_card");
  });

  // "Frase sem forma de pagamento" — sem hint, cai no default por tipo de
  // conta (mesmo comportamento de antes do fix, preservado de propósito).
  test("sem hint, usa o default por tipo de conta (checking -> debit)", () => {
    assert.equal(resolvePaymentMethod(null, "checking"), "debit");
  });

  test("sem hint, usa o default por tipo de conta (credit_card -> credit_card)", () => {
    assert.equal(resolvePaymentMethod(null, "credit_card"), "credit_card");
  });

  test("sem hint, usa o default por tipo de conta (investment -> other)", () => {
    assert.equal(resolvePaymentMethod(null, "investment"), "other");
  });
});

describe("matchPaymentAccount", () => {
  test("auto-seleciona a única conta corrente quando o usuário diz 'no débito'", () => {
    const accounts = [
      account({ id: "1", account_key: "checking-1", kind: "checking", name: "Conta principal" }),
      account({ id: "2", account_key: "card-1", kind: "credit_card", name: "Cartão único" }),
    ];
    const result = matchPaymentAccount(
      accounts,
      [],
      { paymentMethodHint: "debit", accountNameHint: null },
      null,
    );
    assert.deepEqual(result, {
      status: "resolved",
      accountId: "checking-1",
      accountKind: "checking",
      additionalCardId: null,
    });
  });

  test("auto-seleciona o único cartão quando o usuário diz 'no crédito'", () => {
    const accounts = [
      account({ id: "1", account_key: "checking-1", kind: "checking", name: "Conta principal" }),
      account({ id: "2", account_key: "card-1", kind: "credit_card", name: "Cartão único" }),
    ];
    const result = matchPaymentAccount(
      accounts,
      [],
      { paymentMethodHint: "credit", accountNameHint: null },
      null,
    );
    assert.deepEqual(result, {
      status: "resolved",
      accountId: "card-1",
      accountKind: "credit_card",
      additionalCardId: null,
    });
  });

  test("pede confirmação quando há mais de um cartão e nenhum nome foi dito", () => {
    const accounts = [
      account({ id: "1", account_key: "card-nubank", kind: "credit_card", name: "Nubank" }),
      account({ id: "2", account_key: "card-inter", kind: "credit_card", name: "Inter" }),
    ];
    const result = matchPaymentAccount(
      accounts,
      [],
      { paymentMethodHint: "credit", accountNameHint: null },
      null,
    );
    assert.equal(result.status, "ambiguous");
    if (result.status === "ambiguous") {
      assert.equal(result.candidates.length, 2);
      assert.equal(result.accountKind, "credit_card");
    }
  });

  test("usa a conta principal quando o titular tem mais de uma conta corrente e nenhum banco foi citado", () => {
    const accounts = [
      account({
        id: "1",
        account_key: "checking-1",
        kind: "checking",
        name: "Conta A",
        owner_user_id: "maria",
      }),
      account({
        id: "2",
        account_key: "checking-2",
        kind: "checking",
        name: "Conta B",
        owner_user_id: "maria",
        is_primary: true,
      }),
    ];
    const result = matchPaymentAccount(
      accounts,
      [],
      { paymentMethodHint: "pix", accountNameHint: null },
      "maria",
    );
    assert.deepEqual(result, {
      status: "resolved",
      accountId: "checking-2",
      accountKind: "checking",
      additionalCardId: null,
    });
  });

  test("sem conta principal marcada, duas contas corrente do mesmo titular seguem ambíguas", () => {
    const accounts = [
      account({ id: "1", account_key: "checking-1", kind: "checking", owner_user_id: "maria" }),
      account({ id: "2", account_key: "checking-2", kind: "checking", owner_user_id: "maria" }),
    ];
    const result = matchPaymentAccount(
      accounts,
      [],
      { paymentMethodHint: "pix", accountNameHint: null },
      "maria",
    );
    assert.equal(result.status, "ambiguous");
  });

  test("casa pelo nome mencionado ('no Nubank') mesmo com vários cartões cadastrados", () => {
    const accounts = [
      account({ id: "1", account_key: "card-nubank", kind: "credit_card", name: "Nubank" }),
      account({ id: "2", account_key: "card-inter", kind: "credit_card", name: "Cartão Inter" }),
    ];
    const result = matchPaymentAccount(
      accounts,
      [],
      { paymentMethodHint: "credit", accountNameHint: "Nubank" },
      null,
    );
    assert.deepEqual(result, {
      status: "resolved",
      accountId: "card-nubank",
      accountKind: "credit_card",
      additionalCardId: null,
    });
  });

  test("casamento de nome ignora acentos e caixa", () => {
    const accounts = [
      account({ id: "1", account_key: "card-itau", kind: "credit_card", name: "Cartão Itaú" }),
    ];
    const result = matchPaymentAccount(
      accounts,
      [],
      { paymentMethodHint: "credit", accountNameHint: "itau" },
      null,
    );
    assert.deepEqual(result, {
      status: "resolved",
      accountId: "card-itau",
      accountKind: "credit_card",
      additionalCardId: null,
    });
  });

  test("sem forma de pagamento nem nome, não decide nada", () => {
    const accounts = [account({ id: "1", account_key: "checking-1", kind: "checking" })];
    const result = matchPaymentAccount(
      accounts,
      [],
      { paymentMethodHint: null, accountNameHint: null },
      null,
    );
    assert.deepEqual(result, { status: "none" });
  });

  test("ignora contas arquivadas", () => {
    const accounts = [
      account({ id: "1", account_key: "checking-1", kind: "checking", archived: true }),
      account({ id: "2", account_key: "checking-2", kind: "checking", archived: false }),
    ];
    const result = matchPaymentAccount(
      accounts,
      [],
      { paymentMethodHint: "debit", accountNameHint: null },
      null,
    );
    assert.deepEqual(result, {
      status: "resolved",
      accountId: "checking-2",
      accountKind: "checking",
      additionalCardId: null,
    });
  });

  test("cartão adicional único casa pelo nome do cartão pai e herda account_id/kind dele", () => {
    const accounts = [
      account({ id: "1", account_key: "card-visa", kind: "credit_card", name: "Visa Infinite" }),
    ];
    const holders = [
      additionalCard({ id: "holder-esposa", financial_account_id: "1", member_user_id: "esposa" }),
    ];
    const result = matchPaymentAccount(
      accounts,
      holders,
      { paymentMethodHint: "credit", accountNameHint: "Visa" },
      "esposa",
    );
    assert.deepEqual(result, {
      status: "resolved",
      accountId: "card-visa",
      accountKind: "credit_card",
      additionalCardId: "holder-esposa",
    });
  });

  test("mesmo nome batendo no principal e no adicional é desempatado por quem está logado", () => {
    const accounts = [
      account({ id: "1", account_key: "card-visa", kind: "credit_card", name: "Visa Infinite" }),
    ];
    const holders = [
      additionalCard({ id: "holder-esposa", financial_account_id: "1", member_user_id: "esposa" }),
    ];

    const asOwner = matchPaymentAccount(
      accounts,
      holders,
      { paymentMethodHint: "credit", accountNameHint: "Visa" },
      "owner",
    );
    assert.deepEqual(asOwner, {
      status: "resolved",
      accountId: "card-visa",
      accountKind: "credit_card",
      additionalCardId: null,
    });

    const asEsposa = matchPaymentAccount(
      accounts,
      holders,
      { paymentMethodHint: "credit", accountNameHint: "Visa" },
      "esposa",
    );
    assert.deepEqual(asEsposa, {
      status: "resolved",
      accountId: "card-visa",
      accountKind: "credit_card",
      additionalCardId: "holder-esposa",
    });
  });

  test("sem ninguém logado bater com o nome ambíguo, pede confirmação (candidatos deduplicados)", () => {
    const accounts = [
      account({ id: "1", account_key: "card-visa", kind: "credit_card", name: "Visa Infinite" }),
    ];
    const holders = [
      additionalCard({ id: "holder-esposa", financial_account_id: "1", member_user_id: "esposa" }),
    ];
    const result = matchPaymentAccount(
      accounts,
      holders,
      { paymentMethodHint: "credit", accountNameHint: "Visa" },
      "outro-membro",
    );
    assert.equal(result.status, "ambiguous");
    if (result.status === "ambiguous") {
      // Principal e adicional apontam pro mesmo account_id — não deve listar duplicado.
      assert.equal(result.candidates.length, 1);
    }
  });

  test("cartão adicional arquivado não entra no casamento", () => {
    const accounts = [
      account({ id: "1", account_key: "card-visa", kind: "credit_card", name: "Visa Infinite" }),
    ];
    const holders = [
      additionalCard({
        id: "holder-esposa",
        financial_account_id: "1",
        member_user_id: "esposa",
        archived: true,
      }),
    ];
    const result = matchPaymentAccount(
      accounts,
      holders,
      { paymentMethodHint: "credit", accountNameHint: "Visa" },
      "esposa",
    );
    assert.deepEqual(result, {
      status: "resolved",
      accountId: "card-visa",
      accountKind: "credit_card",
      additionalCardId: null,
    });
  });
});

// Reproduz o caminho completo de applyAccountMatch (useQuickAddForm.ts): a
// forma de pagamento é resolvida pela conta (matchPaymentAccount) e SEPARADAMENTE
// pelo hint original (resolvePaymentMethod) — as duas chamadas precisam ser
// feitas com o hint verdadeiro em ambas, não só na primeira, senão o "pix"/
// "cash" dito pelo usuário se perde mesmo com a conta certa resolvida.
describe("fluxo completo de voz: conta resolvida + forma de pagamento preservada", () => {
  test("'Gastei 50 no Pix' com uma única conta corrente cadastrada: resolve a conta E mantém 'pix'", () => {
    const accounts = [
      account({ id: "1", account_key: "checking-1", kind: "checking", name: "Conta principal" }),
    ];
    const match = matchPaymentAccount(
      accounts,
      [],
      { paymentMethodHint: "pix", accountNameHint: null },
      null,
    );
    assert.equal(match.status, "resolved");
    if (match.status === "resolved") {
      assert.equal(resolvePaymentMethod("pix", match.accountKind), "pix");
    }
  });

  test("'Paguei em dinheiro' com uma única conta corrente cadastrada: resolve a conta E mantém 'cash'", () => {
    const accounts = [
      account({ id: "1", account_key: "checking-1", kind: "checking", name: "Conta principal" }),
    ];
    const match = matchPaymentAccount(
      accounts,
      [],
      { paymentMethodHint: "cash", accountNameHint: null },
      null,
    );
    assert.equal(match.status, "resolved");
    if (match.status === "resolved") {
      assert.equal(resolvePaymentMethod("cash", match.accountKind), "cash");
    }
  });
});
