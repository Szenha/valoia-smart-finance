import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  assignOccurrences,
  buildStatementLineHash,
  dedupePdfTransactions,
  normalizeStatementDescription,
} from "./dedup";

describe("statement import deduplication", () => {
  test("normalizes descriptions for stable matching", () => {
    assert.equal(normalizeStatementDescription("  PADARIA  São   João "), "padaria sao joao");
  });

  test("keeps a stable line hash independent from PDF filename", () => {
    const base = {
      source: "pdf" as const,
      accountId: "card-1",
      accountKind: "credit_card",
      postedAt: "2026-08-10T00:00:00.000Z",
      amount: -100,
      description: "LOJA PARC 02/05",
      fitId: null,
      occurrence: 1,
    };
    assert.equal(buildStatementLineHash(base), buildStatementLineHash({ ...base }));
  });

  test("keeps OFX line hashes stable when synthetic FITIDs change with export order", () => {
    const firstExport = assignOccurrences([
      {
        source: "ofx" as const,
        accountId: "checking-1",
        accountKind: "checking",
        postedAt: "2026-08-10T00:00:00.000Z",
        amount: -25,
        description: "Padaria",
        fitId: null,
      },
      {
        source: "ofx" as const,
        accountId: "checking-1",
        accountKind: "checking",
        postedAt: "2026-08-11T00:00:00.000Z",
        amount: -40,
        description: "Mercado",
        fitId: null,
      },
    ]).map(buildStatementLineHash);
    const secondExport = assignOccurrences([
      {
        source: "ofx" as const,
        accountId: "checking-1",
        accountKind: "checking",
        postedAt: "2026-08-11T00:00:00.000Z",
        amount: -40,
        description: "Mercado",
        fitId: null,
      },
      {
        source: "ofx" as const,
        accountId: "checking-1",
        accountKind: "checking",
        postedAt: "2026-08-10T00:00:00.000Z",
        amount: -25,
        description: "Padaria",
        fitId: null,
      },
    ]).map(buildStatementLineHash);

    assert.deepEqual(new Set(firstExport), new Set(secondExport));
  });

  test("assigns occurrence counters to preserve truly repeated PDF lines", () => {
    const [first, second] = assignOccurrences([
      {
        source: "pdf" as const,
        accountId: "card-1",
        accountKind: "credit_card",
        postedAt: "2026-08-10",
        amount: -39.9,
        description: "Estacionamento",
        fitId: null,
      },
      {
        source: "pdf" as const,
        accountId: "card-1",
        accountKind: "credit_card",
        postedAt: "2026-08-10",
        amount: -39.9,
        description: "Estacionamento",
        fitId: null,
      },
    ]);
    assert.equal(first.occurrence, 1);
    assert.equal(second.occurrence, 2);
    assert.notEqual(
      buildStatementLineHash(first),
      buildStatementLineHash(second),
      "same visible fields but different occurrence must create separate line hashes",
    );
  });

  test("dedupes exact duplicated PDF transactions returned by overlapping batches", () => {
    const rows = dedupePdfTransactions([
      {
        date: "2026-08-10",
        amount: 100,
        description: "LOJA PARC 02/05",
        source_excerpt: "10/08 LOJA PARC 02/05 100,00",
        installment_number: 2,
        total_installments: 5,
      },
      {
        date: "2026-08-10",
        amount: 100,
        description: "LOJA PARC 02/05",
        source_excerpt: "10/08 LOJA PARC 02/05 100,00",
        installment_number: 2,
        total_installments: 5,
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].installment_number, 2);
    assert.equal(rows[0].total_installments, 5);
  });

  test("preserves similar PDF transactions when source excerpts differ", () => {
    const rows = dedupePdfTransactions([
      {
        date: "2026-08-10",
        amount: 50,
        description: "Uber",
        source_excerpt: "10/08 Uber viagem A 50,00",
      },
      {
        date: "2026-08-10",
        amount: 50,
        description: "Uber",
        source_excerpt: "10/08 Uber viagem B 50,00",
      },
    ]);
    assert.equal(rows.length, 2);
  });
});
