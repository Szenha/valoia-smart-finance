import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  addDaysToDateOnly,
  addMonthsToDateOnly,
  dateOnlyStringToLocalDate,
  daysUntilDateOnly,
  formatDateBR,
  monthsBetweenDateOnly,
  startOfMonthDateOnly,
} from "./date-utils";

describe("formatDateBR", () => {
  test("formats a plain date-only string", () => {
    assert.equal(formatDateBR("2026-07-20"), "20/07/2026");
  });

  test("formats a UTC-midnight timestamptz without shifting to the previous day", () => {
    // This is exactly the bug scenario: a timestamptz stored as midnight UTC
    // must still render as the same calendar day, never one day earlier.
    assert.equal(formatDateBR("2026-07-20T00:00:00.000Z"), "20/07/2026");
  });

  test("formats a timestamptz with a non-zero time component", () => {
    assert.equal(formatDateBR("2026-01-05T23:59:59+00:00"), "05/01/2026");
  });

  test("returns empty string for null/undefined/empty input", () => {
    assert.equal(formatDateBR(null), "");
    assert.equal(formatDateBR(undefined), "");
    assert.equal(formatDateBR(""), "");
  });
});

describe("addDaysToDateOnly", () => {
  test("adds days within the same month", () => {
    assert.equal(addDaysToDateOnly("2026-07-10", 5), "2026-07-15");
  });

  test("crosses a month boundary", () => {
    assert.equal(addDaysToDateOnly("2026-07-28", 5), "2026-08-02");
  });

  test("crosses a year boundary", () => {
    assert.equal(addDaysToDateOnly("2026-12-29", 5), "2027-01-03");
  });

  test("supports negative days", () => {
    assert.equal(addDaysToDateOnly("2026-07-01", -1), "2026-06-30");
  });
});

describe("addMonthsToDateOnly", () => {
  test("adds months within the same year", () => {
    assert.equal(addMonthsToDateOnly("2026-01-15", 2), "2026-03-15");
  });

  test("crosses a year boundary", () => {
    assert.equal(addMonthsToDateOnly("2026-11-15", 3), "2027-02-15");
  });
});

describe("startOfMonthDateOnly", () => {
  test("returns the first day of the month", () => {
    assert.equal(startOfMonthDateOnly("2026-07-20"), "2026-07-01");
  });
});

describe("monthsBetweenDateOnly", () => {
  test("computes whole months between two dates in the same year", () => {
    assert.equal(monthsBetweenDateOnly("2026-01-10", "2026-04-25"), 3);
  });

  test("computes whole months across a year boundary", () => {
    assert.equal(monthsBetweenDateOnly("2026-11-01", "2027-02-01"), 3);
  });
});

describe("daysUntilDateOnly", () => {
  test("computes positive days until a future date", () => {
    assert.equal(daysUntilDateOnly("2026-07-20", "2026-07-25"), 5);
  });

  test("computes negative days for a past date (overdue)", () => {
    assert.equal(daysUntilDateOnly("2026-07-20", "2026-07-15"), -5);
  });

  test("returns 0 for the same date", () => {
    assert.equal(daysUntilDateOnly("2026-07-20", "2026-07-20"), 0);
  });
});

describe("dateOnlyStringToLocalDate", () => {
  test("produces a Date whose local getters match the input, regardless of timezone", () => {
    const date = dateOnlyStringToLocalDate("2026-07-20");
    assert.equal(date.getFullYear(), 2026);
    assert.equal(date.getMonth(), 6);
    assert.equal(date.getDate(), 20);
  });
});
