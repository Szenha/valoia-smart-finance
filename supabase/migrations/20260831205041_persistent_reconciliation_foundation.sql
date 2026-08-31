-- Fase 1: base persistente de conciliação.
-- O arquivo importado passa a ser evidência; períodos, linhas externas e
-- vínculos sobrevivem à exclusão de statement_imports.

create table if not exists public.reconciliation_periods (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope_type text not null check (scope_type in ('account_statement', 'card_invoice')),
  account_id text not null,
  account_kind account_kind not null,
  period_start date not null,
  period_end date not null,
  competence_period date not null,
  status text not null default 'open' check (status in ('open', 'ready_to_close', 'closed', 'reopened')),
  expected_total numeric(15,2),
  system_total numeric(15,2),
  difference numeric(15,2),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, scope_type, account_id, account_kind, period_start, period_end)
);

create table if not exists public.external_statement_items (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reconciliation_period_id uuid not null references public.reconciliation_periods(id) on delete cascade,
  statement_import_id uuid references public.statement_imports(id) on delete set null,
  source_type text not null check (source_type in ('ofx_checking', 'ofx_credit_card', 'pdf_card_invoice')),
  source_fingerprint text not null,
  reconciliation_fingerprint text not null,
  raw_description text not null default '',
  normalized_description text not null default '',
  amount numeric(15,2) not null,
  posted_at timestamptz not null,
  account_id text not null,
  account_kind account_kind not null,
  fit_id text,
  line_hash text,
  installment_number integer,
  total_installments integer,
  status text not null default 'pending' check (status in ('pending', 'matched', 'accepted', 'ignored', 'review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_fingerprint)
);

create table if not exists public.reconciliation_links (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_statement_item_id uuid not null references public.external_statement_items(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  status text not null check (status in ('matched', 'accepted_new', 'edited_existing', 'ignored', 'review')),
  confidence numeric(4,3) check (confidence between 0 and 1),
  match_reason text,
  matched_by uuid references auth.users(id),
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_statement_item_id)
);

alter table public.reconciliation_periods enable row level security;
alter table public.external_statement_items enable row level security;
alter table public.reconciliation_links enable row level security;

create policy "reconciliation_periods_select" on public.reconciliation_periods for select
  using (public.is_org_member(organization_id));
create policy "reconciliation_periods_insert" on public.reconciliation_periods for insert
  with check (public.is_org_contributor(organization_id));
create policy "reconciliation_periods_update" on public.reconciliation_periods for update
  using (public.is_org_contributor(organization_id))
  with check (public.is_org_contributor(organization_id));
create policy "reconciliation_periods_delete" on public.reconciliation_periods for delete
  using (public.is_org_admin(organization_id));

create policy "external_statement_items_select" on public.external_statement_items for select
  using (public.is_org_member(organization_id));
create policy "external_statement_items_insert" on public.external_statement_items for insert
  with check (public.is_org_contributor(organization_id));
create policy "external_statement_items_update" on public.external_statement_items for update
  using (public.is_org_contributor(organization_id))
  with check (public.is_org_contributor(organization_id));
create policy "external_statement_items_delete" on public.external_statement_items for delete
  using (public.is_org_admin(organization_id));

create policy "reconciliation_links_select" on public.reconciliation_links for select
  using (public.is_org_member(organization_id));
create policy "reconciliation_links_insert" on public.reconciliation_links for insert
  with check (public.is_org_contributor(organization_id));
create policy "reconciliation_links_update" on public.reconciliation_links for update
  using (public.is_org_contributor(organization_id))
  with check (public.is_org_contributor(organization_id));
create policy "reconciliation_links_delete" on public.reconciliation_links for delete
  using (public.is_org_admin(organization_id));

create index if not exists reconciliation_periods_org_status_idx
  on public.reconciliation_periods(organization_id, status, period_start desc);

create index if not exists external_statement_items_period_idx
  on public.external_statement_items(reconciliation_period_id, status, posted_at desc);

create index if not exists external_statement_items_reconciliation_fingerprint_idx
  on public.external_statement_items(organization_id, reconciliation_fingerprint);

create index if not exists reconciliation_links_transaction_idx
  on public.reconciliation_links(transaction_id)
  where transaction_id is not null;

grant select, insert, update, delete on public.reconciliation_periods to authenticated;
grant select, insert, update, delete on public.external_statement_items to authenticated;
grant select, insert, update, delete on public.reconciliation_links to authenticated;
