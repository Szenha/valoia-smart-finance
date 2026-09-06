-- Fase 2: comprometimento futuro de cartão a partir de parcelas detectadas
-- em faturas/OFX importados, sem criar transactions automaticamente.

create table if not exists public.installment_projections (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id text not null,
  account_kind account_kind not null,
  source_external_item_id uuid references public.external_statement_items(id) on delete set null,
  reconciliation_period_id uuid references public.reconciliation_periods(id) on delete set null,
  installment_plan_id uuid references public.installment_plans(id) on delete set null,
  linked_transaction_id uuid references public.transactions(id) on delete set null,
  description text not null default '',
  normalized_description text not null default '',
  installment_number integer not null check (installment_number > 0),
  total_installments integer not null check (total_installments > 1),
  expected_amount numeric(15,2) not null check (expected_amount >= 0),
  expected_posted_at date not null,
  expected_competence_month date not null,
  status text not null default 'detected'
    check (status in ('detected', 'confirmed', 'linked', 'reconciled', 'divergent', 'ignored')),
  source_type text not null
    check (source_type in ('pdf_card_invoice', 'ofx_credit_card', 'manual_projection')),
  projection_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (installment_number <= total_installments),
  unique (organization_id, projection_fingerprint)
);

alter table public.installment_projections enable row level security;

drop policy if exists "installment_projections_select" on public.installment_projections;
drop policy if exists "installment_projections_insert" on public.installment_projections;
drop policy if exists "installment_projections_update" on public.installment_projections;
drop policy if exists "installment_projections_delete" on public.installment_projections;

create policy "installment_projections_select" on public.installment_projections for select
  using (public.is_org_member(organization_id));
create policy "installment_projections_insert" on public.installment_projections for insert
  with check (public.is_org_contributor(organization_id));
create policy "installment_projections_update" on public.installment_projections for update
  using (public.is_org_contributor(organization_id))
  with check (public.is_org_contributor(organization_id));
create policy "installment_projections_delete" on public.installment_projections for delete
  using (public.is_org_admin(organization_id));

create index if not exists installment_projections_org_card_month_idx
  on public.installment_projections(
    organization_id,
    account_id,
    account_kind,
    expected_competence_month,
    status
  );

create index if not exists installment_projections_external_item_idx
  on public.installment_projections(source_external_item_id)
  where source_external_item_id is not null;

create index if not exists installment_projections_linked_transaction_idx
  on public.installment_projections(linked_transaction_id)
  where linked_transaction_id is not null;

grant select, insert, update, delete on public.installment_projections to authenticated;

create or replace function public.card_future_commitments(
  p_org_id uuid,
  p_reference_date date default current_date
)
returns table(
  account_id uuid,
  account_key text,
  name text,
  competence_month date,
  total_internal_transactions numeric,
  total_detected_projections numeric,
  total_confirmed numeric,
  total_reconciled numeric,
  total_divergent numeric,
  total_commitment_without_double_count numeric,
  detected_count bigint,
  confirmed_count bigint,
  linked_count bigint,
  reconciled_count bigint,
  divergent_count bigint,
  ignored_count bigint,
  item_count bigint
)
language sql stable security invoker
set search_path = public
as $$
  with cards as (
    select fa.id, fa.account_key, fa.name, fa.closing_day
    from public.financial_accounts fa
    where fa.organization_id = p_org_id
      and fa.kind = 'credit_card'
      and fa.archived = false
  ),
  internal as (
    select
      c.id as account_id,
      c.account_key,
      c.name,
      public.competence_month(t.posted_at::date, c.closing_day) as competence_month,
      sum(abs(t.amount)) as total_internal_transactions,
      count(*) as internal_count
    from cards c
    join public.transactions t
      on t.organization_id = p_org_id
     and t.account_id = c.account_key
     and t.account_kind = 'credit_card'
     and t.installment_plan_id is not null
     and public.competence_month(t.posted_at::date, c.closing_day)
       > public.competence_month(p_reference_date, c.closing_day)
    group by c.id, c.account_key, c.name, public.competence_month(t.posted_at::date, c.closing_day)
  ),
  projections as (
    select
      c.id as account_id,
      c.account_key,
      c.name,
      ip.expected_competence_month as competence_month,
      sum(ip.expected_amount) filter (where ip.status = 'detected') as total_detected_projections,
      sum(ip.expected_amount) filter (where ip.status = 'confirmed') as total_confirmed,
      sum(ip.expected_amount) filter (where ip.status in ('linked', 'reconciled')) as total_reconciled,
      sum(ip.expected_amount) filter (where ip.status = 'divergent') as total_divergent,
      sum(ip.expected_amount) filter (
        where ip.status in ('detected', 'confirmed')
          and ip.linked_transaction_id is null
      ) as total_projection_counted,
      count(*) filter (where ip.status = 'detected') as detected_count,
      count(*) filter (where ip.status = 'confirmed') as confirmed_count,
      count(*) filter (where ip.status = 'linked') as linked_count,
      count(*) filter (where ip.status = 'reconciled') as reconciled_count,
      count(*) filter (where ip.status = 'divergent') as divergent_count,
      count(*) filter (where ip.status = 'ignored') as ignored_count,
      count(*) filter (where ip.status <> 'ignored') as projection_count
    from cards c
    join public.installment_projections ip
      on ip.organization_id = p_org_id
     and ip.account_id = c.account_key
     and ip.account_kind = 'credit_card'
     and ip.expected_competence_month > public.competence_month(p_reference_date, c.closing_day)
    group by c.id, c.account_key, c.name, ip.expected_competence_month
  )
  select
    coalesce(i.account_id, p.account_id) as account_id,
    coalesce(i.account_key, p.account_key) as account_key,
    coalesce(i.name, p.name) as name,
    coalesce(i.competence_month, p.competence_month) as competence_month,
    coalesce(i.total_internal_transactions, 0) as total_internal_transactions,
    coalesce(p.total_detected_projections, 0) as total_detected_projections,
    coalesce(p.total_confirmed, 0) as total_confirmed,
    coalesce(p.total_reconciled, 0) as total_reconciled,
    coalesce(p.total_divergent, 0) as total_divergent,
    coalesce(i.total_internal_transactions, 0) + coalesce(p.total_projection_counted, 0)
      as total_commitment_without_double_count,
    coalesce(p.detected_count, 0) as detected_count,
    coalesce(p.confirmed_count, 0) as confirmed_count,
    coalesce(p.linked_count, 0) as linked_count,
    coalesce(p.reconciled_count, 0) as reconciled_count,
    coalesce(p.divergent_count, 0) as divergent_count,
    coalesce(p.ignored_count, 0) as ignored_count,
    coalesce(i.internal_count, 0) + coalesce(p.projection_count, 0) as item_count
  from internal i
  full join projections p
    on p.account_id = i.account_id
   and p.competence_month = i.competence_month
  order by coalesce(i.name, p.name), coalesce(i.competence_month, p.competence_month);
$$;

grant execute on function public.card_future_commitments(uuid, date) to authenticated;
