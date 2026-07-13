-- Frente 1: itens de extrato separados dos lancamentos do dia a dia.

create table if not exists statement_items (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  statement_import_id uuid not null references statement_imports(id) on delete cascade,
  matched_transaction_id uuid references transactions(id) on delete set null,
  amount numeric(15,2) not null,
  description text not null default '',
  posted_at timestamptz not null,
  fit_id text,
  type text not null,
  account_id text not null,
  account_kind account_kind not null,
  currency text not null default 'BRL',
  bank_id text,
  check_number text,
  status text not null default 'pending'
    check (status in ('pending', 'matched', 'accepted', 'review')),
  match_confidence numeric(4,3)
    check (match_confidence between 0 and 1),
  extraction_confidence numeric(4,3)
    check (extraction_confidence between 0 and 1),
  extraction_source_excerpt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, statement_import_id, fit_id)
);

alter table statement_items enable row level security;

create policy "statement_items_select" on statement_items for select
  using (public.is_org_member(organization_id));
create policy "statement_items_insert" on statement_items for insert
  with check (public.is_org_contributor(organization_id));
create policy "statement_items_update" on statement_items for update
  using (public.is_org_contributor(organization_id));
create policy "statement_items_delete" on statement_items for delete
  using (public.is_org_admin(organization_id));

alter table transactions
  add column if not exists reconciled_statement_item_id uuid references statement_items(id) on delete set null;

create index if not exists idx_statement_items_org_import
  on statement_items(organization_id, statement_import_id, status);

create index if not exists idx_statement_items_org_posted
  on statement_items(organization_id, posted_at desc);

create index if not exists idx_transactions_reconciled_item
  on transactions(reconciled_statement_item_id);
