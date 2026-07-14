import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  competenceMonthForPurchase,
  computeInstallmentSchedule,
  splitInstallmentAmounts,
} from "./installments";

describe("splitInstallmentAmounts", () => {
  test("divides evenly when the total splits exactly", () => {
    assert.deepEqual(splitInstallmentAmounts(390, 3), [130, 130, 130]);
  });

  test("puts the rounding remainder on the first installment(s), never dropping cents", () => {
    const amounts = splitInstallmentAmounts(100, 3);
    assert.deepEqual(amounts, [33.34, 33.33, 33.33]);
    assert.equal(Math.round(amounts.reduce((sum, value) => sum + value, 0) * 100), 10000);
  });

  test("distributes a multi-cent remainder across as many installments as needed", () => {
    const amounts = splitInstallmentAmounts(10, 7);
    // 1000 cents / 7 = 142 base, remainder 6 cents -> first 6 installments get +1 cent.
    assert.deepEqual(amounts, [1.43, 1.43, 1.43, 1.43, 1.43, 1.43, 1.42]);
    assert.equal(Math.round(amounts.reduce((sum, value) => sum + value, 0) * 100), 1000);
  });

  test("single installment returns the full amount", () => {
    assert.deepEqual(splitInstallmentAmounts(59.9, 1), [59.9]);
  });
});

describe("competenceMonthForPurchase", () => {
  test("purchase on/before the closing day stays in the current month", () => {
    const result = competenceMonthForPurchase(new Date(2026, 6, 10), 25); // July 10, closes 25th
    assert.deepEqual(result, { year: 2026, monthIndex0: 6 }); // July
  });

  test("purchase after the closing day rolls into next month", () => {
    const result = competenceMonthForPurchase(new Date(2026, 6, 28), 25); // July 28, closes 25th
    assert.deepEqual(result, { year: 2026, monthIndex0: 7 }); // August
  });

  test("purchase after closing day in December rolls into January of next year", () => {
    const result = competenceMonthForPurchase(new Date(2026, 11, 28), 25);
    assert.deepEqual(result, { year: 2027, monthIndex0: 0 });
  });

  test("no closing day configured never shifts the month", () => {
    const result = competenceMonthForPurchase(new Date(2026, 6, 28), null);
    assert.deepEqual(result, { year: 2026, monthIndex0: 6 });
  });
});

describe("computeInstallmentSchedule", () => {
  test("R$390 in 3x on a card that closes on the 25th, purchased before closing", () => {
    const schedule = computeInstallmentSchedule(new Date(2026, 6, 10), 390, 3, 25);
    assert.deepEqual(schedule, [
      { number: 1, amount: 130, postedAt: "2026-07-10" },
      { number: 2, amount: 130, postedAt: "2026-08-10" },
      { number: 3, amount: 130, postedAt: "2026-09-10" },
    ]);
  });

  test("purchase after closing day pushes the whole schedule one month later", () => {
    const schedule = computeInstallmentSchedule(new Date(2026, 6, 28), 390, 3, 25);
    assert.deepEqual(
      schedule.map((s) => s.postedAt),
      ["2026-08-28", "2026-09-28", "2026-10-28"],
    );
  });

  test("R$100 in 3x keeps the remainder cent on the first installment through the schedule", () => {
    const schedule = computeInstallmentSchedule(new Date(2026, 6, 1), 100, 3, 25);
    assert.deepEqual(
      schedule.map((s) => s.amount),
      [33.34, 33.33, 33.33],
    );
  });

  test("clamps day-of-month overflow (purchase on the 31st into a shorter month)", () => {
    // Jan 31 -> Feb only has 28 days in 2026 (not a leap year).
    const schedule = computeInstallmentSchedule(new Date(2026, 0, 31), 60, 2, null);
    assert.deepEqual(
      schedule.map((s) => s.postedAt),
      ["2026-01-31", "2026-02-28"],
    );
  });
});
