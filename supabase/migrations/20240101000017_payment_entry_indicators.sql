-- Tema 3: payment_method / entry_source indicators on transactions.

create type payment_method as enum ('debit', 'credit_card', 'pix', 'other');
create type entry_source as enum ('manual', 'voice_ai', 'ofx_import', 'pdf_import');

alter table transactions add column payment_method payment_method;
alter table transactions add column entry_source entry_source;

-- Backfill payment_method from account_kind (best-effort default; the app
-- picks explicitly going forward, this is only for rows that predate the
-- column).
update transactions
set payment_method = case account_kind
  when 'credit_card' then 'credit_card'
  when 'checking'    then 'debit'
  when 'investment'  then 'other'
end::payment_method
where payment_method is null;

-- Backfill entry_source: rows tied to a statement_imports row inherit the
-- import's source; everything else defaults to manual.
update transactions t
set entry_source = case si.source
  when 'ofx_manual'   then 'ofx_import'
  when 'pdf_manual'   then 'pdf_import'
  when 'open_finance' then 'ofx_import'
  else 'manual'
end::entry_source
from statement_imports si
where t.statement_import_id = si.id
  and t.entry_source is null;

update transactions
set entry_source = 'manual'
where entry_source is null;

alter table transactions
  alter column payment_method set not null,
  alter column entry_source set not null;
