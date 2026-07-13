import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseOfx } from "./parser";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

async function fixture(name: string): Promise<ArrayBuffer> {
  const buffer = await readFile(join(fixturesDir, name));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function latin1Bytes(text: string): Uint8Array {
  return Uint8Array.from(Buffer.from(text, "latin1"));
}

describe("parseOfx", () => {
  test("parses OFX 1.x SGML checking statements with comma amounts, synthetic FITID and fallback date", async () => {
    const doc = parseOfx(await fixture("checking-sgml.ofx"));

    assert.equal(doc.institution?.org, "Banco Exemplo");
    assert.equal(doc.statements.length, 1);

    const statement = doc.statements[0];
    assert.equal(statement.account.kind, "checking");
    assert.equal(statement.account.bankId, "001");
    assert.equal(statement.account.accountId, "12345-6");
    assert.equal(statement.ledgerBalance, 987.66);
    assert.equal(statement.transactions.length, 1);

    const transaction = statement.transactions[0];
    assert.equal(transaction.amount, -12.34);
    assert.equal(transaction.description, "Padaria São João — Café da manhã");
    assert.match(transaction.fitId, /^SYNTH/);
    assert.equal(transaction.fitIdGenerated, true);
    assert.equal(transaction.dateInvalid, true);
    assert.equal(transaction.postedAt.toISOString(), "2024-01-01T00:00:00.000Z");
  });

  test("parses OFX 2.x XML credit card statements with dot amounts", async () => {
    const doc = parseOfx(await fixture("credit-card-xml.ofx"));

    assert.equal(doc.statements.length, 1);
    const statement = doc.statements[0];
    assert.equal(statement.account.kind, "credit_card");
    assert.equal(statement.account.accountId, "9999888877776666");
    assert.equal(statement.transactions.length, 1);
    assert.deepEqual(
      {
        amount: statement.transactions[0].amount,
        fitId: statement.transactions[0].fitId,
        description: statement.transactions[0].description,
        currency: statement.transactions[0].currency,
      },
      {
        amount: -123.45,
        fitId: "CC-001",
        description: "Mercado Central",
        currency: "BRL",
      },
    );
  });

  test("parses investment statements", async () => {
    const doc = parseOfx(await fixture("investment-sgml.ofx"));

    assert.equal(doc.statements.length, 1);
    const statement = doc.statements[0];
    assert.equal(statement.account.kind, "investment");
    assert.equal(statement.account.bankId, "XPTO");
    assert.equal(statement.transactions.length, 1);
    assert.deepEqual(
      {
        type: statement.transactions[0].type,
        amount: statement.transactions[0].amount,
        fitId: statement.transactions[0].fitId,
        description: statement.transactions[0].description,
      },
      {
        type: "BUYMF",
        amount: -1000,
        fitId: "INV-001",
        description: "BUYMF — Tesouro Selic",
      },
    );
  });

  test("decodes Windows-1252 input", () => {
    const input = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <CURDEF>BRL
        <BANKACCTFROM>
          <BANKID>341
          <ACCTID>555
        </BANKACCTFROM>
        <BANKTRANLIST>
          <DTSTART>20240301
          <DTEND>20240331
          <STMTTRN>
            <TRNTYPE>DEBIT
            <DTPOSTED>20240302
            <TRNAMT>-9,99
            <FITID>WIN1
            <NAME>Açougue
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;

    const doc = parseOfx(latin1Bytes(input));

    assert.equal(doc.statements[0].transactions[0].description, "Açougue");
    assert.equal(doc.statements[0].transactions[0].amount, -9.99);
  });

  test("decodes ISO-8859-1 input", () => {
    const input = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:ISO-8859-1

<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <CURDEF>BRL
        <BANKACCTFROM>
          <BANKID>237
          <ACCTID>777
        </BANKACCTFROM>
        <BANKTRANLIST>
          <DTSTART>20240401
          <DTEND>20240430
          <STMTTRN>
            <TRNTYPE>CREDIT
            <DTPOSTED>20240403
            <TRNAMT>1500.50
            <FITID>ISO1
            <NAME>Crédito salário
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;

    const doc = parseOfx(latin1Bytes(input));

    assert.equal(doc.statements[0].transactions[0].description, "Crédito salário");
    assert.equal(doc.statements[0].transactions[0].amount, 1500.5);
  });
});
