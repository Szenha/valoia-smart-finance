import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { accountKindForPaymentMethod, matchPaymentAccount } from "./account-match";
import type { AccountRow } from "./types";

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

describe("matchPaymentAccount", () => {
  test("auto-seleciona a única conta corrente quando o usuário diz 'no débito'", () => {
    const accounts = [
      account({ id: "1", account_key: "checking-1", kind: "checking", name: "Conta principal" }),
      account({ id: "2", account_key: "card-1", kind: "credit_card", name: "Cartão único" }),
    ];
    const result = matchPaymentAccount(accounts, {
      paymentMethodHint: "debit",
      accountNameHint: null,
    });
    assert.deepEqual(result, {
      status: "resolved",
      accountId: "checking-1",
      accountKind: "checking",
    });
  });

  test("auto-seleciona o único cartão quando o usuário diz 'no crédito'", () => {
    const accounts = [
      account({ id: "1", account_key: "checking-1", kind: "checking", name: "Conta principal" }),
      account({ id: "2", account_key: "card-1", kind: "credit_card", name: "Cartão único" }),
    ];
    const result = matchPaymentAccount(accounts, {
      paymentMethodHint: "credit",
      accountNameHint: null,
    });
    assert.deepEqual(result, {
      status: "resolved",
      accountId: "card-1",
      accountKind: "credit_card",
    });
  });

  test("pede confirmação quando há mais de um cartão e nenhum nome foi dito", () => {
    const accounts = [
      account({ id: "1", account_key: "card-nubank", kind: "credit_card", name: "Nubank" }),
      account({ id: "2", account_key: "card-inter", kind: "credit_card", name: "Inter" }),
    ];
    const result = matchPaymentAccount(accounts, {
      paymentMethodHint: "credit",
      accountNameHint: null,
    });
    assert.equal(result.status, "ambiguous");
    if (result.status === "ambiguous") {
      assert.equal(result.candidates.length, 2);
      assert.equal(result.accountKind, "credit_card");
    }
  });

  test("casa pelo nome mencionado ('no Nubank') mesmo com vários cartões cadastrados", () => {
    const accounts = [
      account({ id: "1", account_key: "card-nubank", kind: "credit_card", name: "Nubank" }),
      account({ id: "2", account_key: "card-inter", kind: "credit_card", name: "Cartão Inter" }),
    ];
    const result = matchPaymentAccount(accounts, {
      paymentMethodHint: "credit",
      accountNameHint: "Nubank",
    });
    assert.deepEqual(result, {
      status: "resolved",
      accountId: "card-nubank",
      accountKind: "credit_card",
    });
  });

  test("casamento de nome ignora acentos e caixa", () => {
    const accounts = [
      account({ id: "1", account_key: "card-itau", kind: "credit_card", name: "Cartão Itaú" }),
    ];
    const result = matchPaymentAccount(accounts, {
      paymentMethodHint: "credit",
      accountNameHint: "itau",
    });
    assert.deepEqual(result, {
      status: "resolved",
      accountId: "card-itau",
      accountKind: "credit_card",
    });
  });

  test("sem forma de pagamento nem nome, não decide nada", () => {
    const accounts = [account({ id: "1", account_key: "checking-1", kind: "checking" })];
    const result = matchPaymentAccount(accounts, {
      paymentMethodHint: null,
      accountNameHint: null,
    });
    assert.deepEqual(result, { status: "none" });
  });

  test("ignora contas arquivadas", () => {
    const accounts = [
      account({ id: "1", account_key: "checking-1", kind: "checking", archived: true }),
      account({ id: "2", account_key: "checking-2", kind: "checking", archived: false }),
    ];
    const result = matchPaymentAccount(accounts, {
      paymentMethodHint: "debit",
      accountNameHint: null,
    });
    assert.deepEqual(result, {
      status: "resolved",
      accountId: "checking-2",
      accountKind: "checking",
    });
  });
});
