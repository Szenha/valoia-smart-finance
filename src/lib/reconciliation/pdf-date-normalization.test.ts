import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  anchorPdfTransactionDateToClosingDate,
  inferPdfInvoiceClosingDate,
} from "./pdf-date-normalization";

describe("inferPdfInvoiceClosingDate", () => {
  test("extracts the closing date from the invoice text", () => {
    assert.equal(
      inferPdfInvoiceClosingDate("Resumo da fatura\nFatura fechada em 05/09/2026\nTotal: 1.234,56"),
      "2026-09-05",
    );
  });

  test("is accent-insensitive and case-insensitive", () => {
    assert.equal(inferPdfInvoiceClosingDate("FATURA FECHADA EM 28/02/2027"), "2027-02-28");
  });

  test("returns null when the invoice text has no closing date", () => {
    assert.equal(inferPdfInvoiceClosingDate("Fatura em aberto - vencimento 10/10/2026"), null);
  });
});

describe("anchorPdfTransactionDateToClosingDate", () => {
  test("returns the date unchanged when there is no closing date reference", () => {
    assert.equal(anchorPdfTransactionDateToClosingDate("2025-08-15", null), "2025-08-15");
  });

  test("keeps the purchase month and day, only anchoring the year to the invoice", () => {
    const result = anchorPdfTransactionDateToClosingDate("2020-08-15", "2026-09-05");
    assert.equal(result, "2026-08-15");
    assert.equal(result.slice(5, 7), "08");
  });

  test("rolls the year back when the purchase month is after the closing month", () => {
    // Compra de dezembro numa fatura que fecha em janeiro do ano seguinte.
    const result = anchorPdfTransactionDateToClosingDate("2025-12-20", "2026-01-05");
    assert.equal(result, "2025-12-20");
    assert.equal(result.slice(5, 7), "12");
  });

  test("accepts BR formatted dates and preserves the month", () => {
    const result = anchorPdfTransactionDateToClosingDate("20/12/2099", "2026-01-05");
    assert.equal(result, "2025-12-20");
  });

  test("does not change a date already consistent with the closing date", () => {
    assert.equal(anchorPdfTransactionDateToClosingDate("2026-08-31", "2026-09-10"), "2026-08-31");
  });

  test("returns the input unchanged when it cannot be parsed", () => {
    assert.equal(anchorPdfTransactionDateToClosingDate("sem data", "2026-09-05"), "sem data");
  });

  test("never shifts the purchase month across a range of inputs", () => {
    const closing = "2026-06-15";
    for (let month = 1; month <= 12; month++) {
      const mm = String(month).padStart(2, "0");
      const out = anchorPdfTransactionDateToClosingDate(`2000-${mm}-10`, closing);
      assert.equal(out.slice(5, 7), mm, `mês ${mm} deveria ser preservado`);
    }
  });
});
