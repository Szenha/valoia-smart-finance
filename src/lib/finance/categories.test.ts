import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  buildCategoryTree,
  categoryOptions,
  findSiblingGroup,
  leafCategoryOptions,
} from "./categories";
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

describe("category ordering", () => {
  test("root categories: receitas antes de despesas, alfabético dentro de cada seção sem sort_order", () => {
    const categories: CategoryRow[] = [
      { id: "moradia", name: "Moradia", type: "expense", parent_id: null },
      { id: "salario", name: "Salário", type: "income", parent_id: null },
      { id: "alimentacao", name: "Alimentação", type: "expense", parent_id: null },
      { id: "freelance", name: "Freelance", type: "income", parent_id: null },
    ];
    const tree = buildCategoryTree(categories);
    assert.deepEqual(
      tree.map((c) => c.name),
      ["Freelance", "Salário", "Alimentação", "Moradia"],
    );
  });

  test("sort_order manual vence o alfabético e é respeitado dentro do grupo", () => {
    const categories: CategoryRow[] = [
      { id: "lazer", name: "Lazer", type: "expense", parent_id: null, sort_order: 1 },
      { id: "moradia", name: "Moradia", type: "expense", parent_id: null, sort_order: 0 },
      { id: "alimentacao", name: "Alimentação", type: "expense", parent_id: null },
    ];
    const tree = buildCategoryTree(categories);
    // As duas com sort_order vêm primeiro, na ordem definida; a sem
    // sort_order (fallback alfabético) fica por último.
    assert.deepEqual(
      tree.map((c) => c.name),
      ["Moradia", "Lazer", "Alimentação"],
    );
  });

  test("findSiblingGroup encontra o array de irmãs certo, na raiz e aninhado", () => {
    const educacao: CategoryRow = {
      id: "educacao",
      name: "Educação",
      type: "expense",
      parent_id: null,
    };
    const saude: CategoryRow = { id: "saude", name: "Saúde", type: "expense", parent_id: null };
    const material: CategoryRow = {
      id: "material",
      name: "Material Escolar",
      type: "expense",
      parent_id: "educacao",
    };
    const mensalidade: CategoryRow = {
      id: "mensalidade",
      name: "Mensalidade",
      type: "expense",
      parent_id: "educacao",
    };
    const categories = [educacao, saude, material, mensalidade];
    const tree = buildCategoryTree(categories);

    const rootGroup = findSiblingGroup(tree, "saude");
    assert.deepEqual(rootGroup?.map((c) => c.id).sort(), ["educacao", "saude"]);

    const childGroup = findSiblingGroup(tree, "mensalidade");
    assert.deepEqual(childGroup?.map((c) => c.id).sort(), ["material", "mensalidade"]);

    assert.equal(findSiblingGroup(tree, "não-existe"), null);
  });
});
