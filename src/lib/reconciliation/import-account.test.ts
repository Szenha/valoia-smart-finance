import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { resolveConfirmedImportAccount } from "./import-account";

const accounts = [
  { id: "acc-1", name: "Conta corrente" },
  { id: "card-1", name: "Cartão roxinho" },
  { id: "card-2", name: "Cartão preto" },
];

describe("resolveConfirmedImportAccount", () => {
  test("returns null when nothing is selected (no default account)", () => {
    assert.equal(resolveConfirmedImportAccount(accounts, ""), null);
    assert.equal(resolveConfirmedImportAccount(accounts, null), null);
    assert.equal(resolveConfirmedImportAccount(accounts, undefined), null);
  });

  test("never falls back to the first account", () => {
    assert.equal(resolveConfirmedImportAccount(accounts, ""), null);
    assert.notEqual(resolveConfirmedImportAccount(accounts, ""), accounts[0]);
  });

  test("returns null when the selected id is unknown", () => {
    assert.equal(resolveConfirmedImportAccount(accounts, "does-not-exist"), null);
  });

  test("returns the exact confirmed account", () => {
    assert.equal(resolveConfirmedImportAccount(accounts, "card-2"), accounts[2]);
  });

  test("returns null for an empty account list", () => {
    assert.equal(resolveConfirmedImportAccount([], "card-1"), null);
  });
});
