-- Rastreamento incremental de planos de parcelamento.
-- Cada registro representa uma compra parcelada, rastreada ao longo do tempo.

create table if not exists installment_plans (
  id                              uuid          primary key default gen_random_uuid(),
  organization_id                 uuid          references organizations(id) on delete cascade,
  account_id                      text          not null,
  description_normalized          text          not null,
  total_installments              integer       not null,
  installment_amount              numeric(15,2) not null,
  first_seen_statement_import_id  uuid          references statement_imports(id) on delete set null,
  current_installment_paid        integer       not null default 0,
  status                          text          not null default 'ativo'
    check (status in ('ativo', 'concluido', 'cancelado')),
  confirmed_by                    uuid          references auth.users(id),
  created_at                      timestamptz   default now(),
  updated_at                      timestamptz   default now()
);

alter table installment_plans enable row level security;

create policy "plans_select" on installment_plans for select
  using (public.is_org_member(organization_id));
create policy "plans_insert" on installment_plans for insert
  with check (public.is_org_contributor(organization_id));
create policy "plans_update" on installment_plans for update
  using (public.is_org_contributor(organization_id));
create policy "plans_delete" on installment_plans for delete
  using (public.is_org_admin(organization_id));

create index idx_installment_plans_org_account
  on installment_plans(organization_id, account_id, status);

-- Colunas de parcelamento nas transações
alter table transactions
  add column if not exists installment_plan_id uuid references installment_plans(id) on delete set null,
  add column if not exists installment_number   integer;

-- Colunas de parcelamentos futuros nos extratos
alter table statement_imports
  add column if not exists declared_future_installments    numeric(15,2),
  add column if not exists calculated_future_installments  numeric(15,2);
