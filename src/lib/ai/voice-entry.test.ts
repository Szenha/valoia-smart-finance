import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { parseDraft } from "./voice-entry";

const TODAY = "2026-07-14";

function draftJson(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    description: "Mercado",
    amount: 42,
    ...overrides,
  });
}

describe("parseDraft date handling", () => {
  test("keeps a plausible date the model returned", () => {
    const draft = parseDraft(draftJson({ date: "2026-07-10" }), "fallback", TODAY);
    assert.equal(draft.date, "2026-07-10");
  });

  test("falls back to today when the model hallucinates an epoch date", () => {
    const draft = parseDraft(draftJson({ date: "1970-01-01" }), "fallback", TODAY);
    assert.equal(draft.date, TODAY);
  });

  test("falls back to today when date is missing entirely", () => {
    const draft = parseDraft(draftJson({}), "fallback", TODAY);
    assert.equal(draft.date, TODAY);
  });

  test("falls back to today when date is malformed", () => {
    const draft = parseDraft(draftJson({ date: "not-a-date" }), "fallback", TODAY);
    assert.equal(draft.date, TODAY);
  });

  test("falls back to today when the year is implausibly far away", () => {
    const draft = parseDraft(draftJson({ date: "2099-01-01" }), "fallback", TODAY);
    assert.equal(draft.date, TODAY);
  });

  test("accepts a date up to a year in the past or future (e.g. year-end trips)", () => {
    const draft = parseDraft(draftJson({ date: "2027-01-05" }), "fallback", TODAY);
    assert.equal(draft.date, "2027-01-05");
  });
});

describe("parseDraft basic fields", () => {
  test("throws when the model didn't return a JSON object", () => {
    assert.throws(() => parseDraft("not json at all", "fallback", TODAY));
  });

  test("throws when description or amount are missing", () => {
    assert.throws(() => parseDraft(JSON.stringify({ amount: 10 }), "fallback", TODAY));
  });

  test("defaults installments_count to 1 when absent", () => {
    const draft = parseDraft(draftJson({}), "fallback", TODAY);
    assert.equal(draft.installments_count, 1);
  });
});
