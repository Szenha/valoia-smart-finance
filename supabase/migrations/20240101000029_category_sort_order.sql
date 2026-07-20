-- Ordenação manual de categorias dentro de um mesmo grupo de irmãs (mesmo
-- parent_id e, no nível raiz, mesmo type — receitas e despesas continuam em
-- seções separadas). null = ainda não reordenada manualmente, cai no
-- fallback alfabético já existente em buildCategoryTree.
alter table categories
  add column sort_order integer;
