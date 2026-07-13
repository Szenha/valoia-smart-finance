-- Frente 2: fechamento e reabertura de periodos conciliados.

create table if not exists period_closures (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  scope_type text not null check (scope_type in ('card_invoice', 'account_month')),
  account_id text not null,
  account_kind account_kind not null,
  competence_period date not null,
  status text not null default 'aberto' check (status in ('aberto', 'fechado')),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  reopened_by uuid references auth.users(id),
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, scope_type, account_id, account_kind, competence_period)
);

alter table period_closures enable row level security;

create policy "period_closures_select" on period_closures for select
  using (public.is_org_member(organization_id));
create policy "period_closures_insert" on period_closures for insert
  with check (public.is_org_member(organization_id));
create policy "period_closures_update" on period_closures for update
  using (public.is_org_member(organization_id));
create policy "period_closures_delete" on period_closures for delete
  using (public.is_org_admin(organization_id));

alter table transactions
  add column if not exists consolidation_status text not null default 'aberto'
    check (consolidation_status in ('aberto', 'consolidado')),
  add column if not exists period_closure_id uuid references period_closures(id) on delete set null;

create index if not exists idx_period_closures_org_scope
  on period_closures(organization_id, scope_type, account_id, account_kind, competence_period);

create index if not exists idx_transactions_period_closure
  on transactions(period_closure_id);
