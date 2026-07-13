-- Prepara o enum usado pela migration de importacao PDF.
-- Este arquivo precisa rodar antes de 20240101000004_pdf_import_schema.sql,
-- que adiciona statement_imports.source usando este tipo.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'import_source') then
    create type import_source as enum ('ofx_manual', 'pdf_manual', 'open_finance', 'ofx_file');
  end if;
end $$;
