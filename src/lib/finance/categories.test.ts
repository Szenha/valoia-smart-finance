import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { buildCategoryTree, categoryOptions, leafCategoryOptions } from "./categories";
import type { CategoryRow } from "./types";

describe("category tree nesting", () => {
  test("subcategory created under a root category nests visually, matching the /cadastros/categorias create flow", () => {
    // Mirrors the exact manual scenario requested: create root category
    // "Educação", then a subcategory "Material Escolar" pointing at it via
    // parent_id — the same shape produced by the two-step create dialog.
    const educacao: CategoryRow = {
      id: "cat-educacao",
      name: "Educação",
      type: "expense",
      parent_id: null,
    };
    const materialEscolar: CategoryRow = {
      id: "cat-material-escolar",
      name: "Material Escolar",
      type: "expense",
      parent_id: "cat-educacao",
    };
    const categories = [educacao, materialEscolar];

    const tree = buildCategoryTree(categories);
    assert.equal(tree.length, 1, "Educação should be the only root node");
    assert.equal(tree[0].name, "Educação");
    assert.equal(tree[0].children.length, 1, "Material Escolar must nest under Educação");
    assert.equal(tree[0].children[0].name, "Material Escolar");
    assert.equal(tree[0].children[0].depth, 1);
    assert.equal(tree[0].children[0].path, "Educação > Material Escolar");

    const options = categoryOptions(categories);
    assert.deepEqual(
      options.map((c) => c.path),
      ["Educação", "Educação > Material Escolar"],
    );

    // Once "Educação" has a child, it must stop being a selectable leaf for
    // classification — only "Material Escolar" may receive a transaction.
    const leaves = leafCategoryOptions(categories);
    assert.deepEqual(
      leaves.map((c) => c.name),
      ["Material Escolar"],
    );
  });
});
