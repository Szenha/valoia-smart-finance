-- Normaliza o enum import_source apos a migration legada de PDF.
-- A migration 20240101000004 usava default temporario 'ofx_file'; o codigo
-- atual grava 'ofx_manual' e 'pdf_manual'. Mantemos 'open_finance' reservado.

alter table statement_imports
  alter column source drop default;

update statement_imports
set source = 'ofx_manual'::import_source
where source = 'ofx_file'::import_source;

alter table statement_imports
  alter column source type text using source::text;

drop type import_source;

create type import_source as enum ('ofx_manual', 'pdf_manual', 'open_finance');

alter table statement_imports
  alter column source type import_source using source::import_source,
  alter column source set default 'ofx_manual'::import_source;
