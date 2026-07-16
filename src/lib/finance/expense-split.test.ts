import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  calculateExpenseSplit,
  fromCents,
  normalizeShares,
  resolvePayer,
  simplifySettlements,
  toCents,
  type MemberSplitResult,
} from "./expense-split";
import type { AccountRow, TxnRow } from "./types";

function account(overrides: Partial<AccountRow>): AccountRow {
  return {
    id: "acc-1",
    account_key: "key-1",
    name: "Conta",
    institution: null,
    kind: "credit_card",
    archived: false,
    initial_balance: null,
    initial_balance_date: null,
    closing_day: null,
    due_day: null,
    credit_limit: null,
    owner_user_id: "owner",
    ...overrides,
  };
}

describe("toCents / fromCents", () => {
  test("converte reais pra centavos inteiros sem erro de ponto flutuante", () => {
    assert.equal(toCents(10.1), 1010);
    assert.equal(toCents(0.1) + toCents(0.2), 30);
  });

  test("volta de centavos pra reais", () => {
    assert.equal(fromCents(1010), 10.1);
  });
});

describe("resolvePayer", () => {
  test("prioriza spent_by_member_id (cartão adicional) sobre tudo", () => {
    const accounts = [account({ account_key: "visa", owner_user_id: "samuel" })];
    const payer = resolvePayer(
      { spent_by_member_id: "esposa", created_by: "samuel", account_id: "visa" },
      accounts,
    );
    assert.equal(payer, "esposa");
  });

  test("sem cartão adicional, usa o dono da conta/cartão", () => {
    const accounts = [account({ account_key: "visa", owner_user_id: "samuel" })];
    const payer = resolvePayer(
      { spent_by_member_id: null, created_by: "esposa", account_id: "visa" },
      accounts,
    );
    assert.equal(payer, "samuel");
  });

  test("sem conta reconhecida, cai pra quem lançou (created_by)", () => {
    const payer = resolvePayer(
      { spent_by_member_id: null, created_by: "samuel", account_id: "conta-desconhecida" },
      [],
    );
    assert.equal(payer, "samuel");
  });

  test("sem nenhum sinal, pagador não identificado", () => {
    const payer = resolvePayer({ spent_by_member_id: null, created_by: null, account_id: "x" }, []);
    assert.equal(payer, null);
  });
});

describe("normalizeShares", () => {
  test("modo percentual usa os valores como estão", () => {
    const result = normalizeShares(
      [
        { memberId: "a", share: 40 },
        { memberId: "b", share: 60 },
      ],
      "percentage",
    );
    assert.equal(result.get("a"), 40);
    assert.equal(result.get("b"), 60);
  });

  test("modo peso normaliza pra percentual proporcional", () => {
    const result = normalizeShares(
      [
        { memberId: "a", share: 1 },
        { memberId: "b", share: 1 },
        { memberId: "c", share: 0 },
      ],
      "weight",
    );
    assert.equal(result.get("a"), 50);
    assert.equal(result.get("b"), 50);
    assert.equal(result.get("c"), 0);
  });
});

describe("calculateExpenseSplit", () => {
  test("exemplo do pedido: 2 membros 50/50, R$10.000 total", () => {
    const total = toCents(10000);
    const paidBy = new Map([
      ["samuel", toCents(3000)],
      ["esposa", toCents(7000)],
    ]);
    const results = calculateExpenseSplit(
      total,
      [
        { memberId: "samuel", share: 50 },
        { memberId: "esposa", share: 50 },
      ],
      "percentage",
      paidBy,
    );
    const samuel = results.find((r) => r.memberId === "samuel")!;
    const esposa = results.find((r) => r.memberId === "esposa")!;
    assert.equal(samuel.shouldPayCents, toCents(5000));
    assert.equal(esposa.shouldPayCents, toCents(5000));
    assert.equal(samuel.balanceCents, toCents(3000) - toCents(5000));
    assert.equal(esposa.balanceCents, toCents(7000) - toCents(5000));
  });

  test("soma do 'deveria pagar' bate exatamente com o total mesmo com arredondamento feio (3 partes iguais)", () => {
    const total = toCents(100); // R$100 / 3 = 33.333...
    const results = calculateExpenseSplit(
      total,
      [
        { memberId: "a", share: 1 },
        { memberId: "b", share: 1 },
        { memberId: "c", share: 1 },
      ],
      "weight",
      new Map(),
    );
    const sum = results.reduce((s, r) => s + r.shouldPayCents, 0);
    assert.equal(sum, total);
    // Ninguém deveria ficar muito longe de 1/3 (diferença de no máximo 1 centavo).
    for (const r of results) {
      assert.ok(Math.abs(r.shouldPayCents - total / 3) <= 1);
    }
  });

  test("participação por peso (partes) distribui proporcionalmente", () => {
    const total = toCents(300);
    const results = calculateExpenseSplit(
      total,
      [
        { memberId: "samuel", share: 1 },
        { memberId: "esposa", share: 1 },
        { memberId: "filho", share: 0 },
      ],
      "weight",
      new Map(),
    );
    assert.equal(results.find((r) => r.memberId === "samuel")!.shouldPayCents, toCents(150));
    assert.equal(results.find((r) => r.memberId === "esposa")!.shouldPayCents, toCents(150));
    assert.equal(results.find((r) => r.memberId === "filho")!.shouldPayCents, 0);
  });

  test("membro sem nenhum pagamento registrado fica com paidCents zero, não undefined", () => {
    const results = calculateExpenseSplit(
      toCents(100),
      [{ memberId: "a", share: 100 }],
      "percentage",
      new Map(),
    );
    assert.equal(results[0].paidCents, 0);
    assert.equal(results[0].balanceCents, -toCents(100));
  });
});

describe("simplifySettlements", () => {
  test("exemplo do pedido com 2 pessoas: samuel deve R$2.000 pra esposa", () => {
    const results: MemberSplitResult[] = [
      {
        memberId: "samuel",
        participationPercent: 50,
        shouldPayCents: toCents(5000),
        paidCents: toCents(3000),
        balanceCents: toCents(3000) - toCents(5000),
      },
      {
        memberId: "esposa",
        participationPercent: 50,
        shouldPayCents: toCents(5000),
        paidCents: toCents(7000),
        balanceCents: toCents(7000) - toCents(5000),
      },
    ];
    const transfers = simplifySettlements(results);
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0].fromMemberId, "samuel");
    assert.equal(transfers[0].toMemberId, "esposa");
    assert.equal(transfers[0].amountCents, toCents(2000));
  });

  test("exemplo do pedido com 3 pessoas: João paga R$1.000 pro Samuel e R$500 pra Maria", () => {
    const results: MemberSplitResult[] = [
      {
        memberId: "samuel",
        participationPercent: 0,
        shouldPayCents: 0,
        paidCents: 0,
        balanceCents: toCents(1000),
      },
      {
        memberId: "maria",
        participationPercent: 0,
        shouldPayCents: 0,
        paidCents: 0,
        balanceCents: toCents(500),
      },
      {
        memberId: "joao",
        participationPercent: 0,
        shouldPayCents: 0,
        paidCents: 0,
        balanceCents: -toCents(1500),
      },
    ];
    const transfers = simplifySettlements(results);
    assert.equal(transfers.length, 2);
    assert.deepEqual(
      transfers.map((t) => ({
        from: t.fromMemberId,
        to: t.toMemberId,
        amount: fromCents(t.amountCents),
      })),
      [
        { from: "joao", to: "samuel", amount: 1000 },
        { from: "joao", to: "maria", amount: 500 },
      ],
    );
  });

  test("todo mundo quitado não gera nenhuma transferência", () => {
    const results: MemberSplitResult[] = [
      {
        memberId: "a",
        participationPercent: 50,
        shouldPayCents: 100,
        paidCents: 100,
        balanceCents: 0,
      },
      {
        memberId: "b",
        participationPercent: 50,
        shouldPayCents: 100,
        paidCents: 100,
        balanceCents: 0,
      },
    ];
    assert.deepEqual(simplifySettlements(results), []);
  });

  test("soma das transferências sugeridas bate com a soma dos saldos devedores", () => {
    const results: MemberSplitResult[] = [
      {
        memberId: "a",
        participationPercent: 0,
        shouldPayCents: 0,
        paidCents: 0,
        balanceCents: 700,
      },
      {
        memberId: "b",
        participationPercent: 0,
        shouldPayCents: 0,
        paidCents: 0,
        balanceCents: 300,
      },
      {
        memberId: "c",
        participationPercent: 0,
        shouldPayCents: 0,
        paidCents: 0,
        balanceCents: -400,
      },
      {
        memberId: "d",
        participationPercent: 0,
        shouldPayCents: 0,
        paidCents: 0,
        balanceCents: -600,
      },
    ];
    const transfers = simplifySettlements(results);
    const totalTransferred = transfers.reduce((sum, t) => sum + t.amountCents, 0);
    assert.equal(totalTransferred, 1000);
    // Nunca mais transferências do que (credores + devedores - 1).
    assert.ok(transfers.length <= 3);
  });
});
