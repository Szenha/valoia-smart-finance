-- Recursos da Fase 2: entradas manuais/voz, contas gerenciaveis e RPCs de painel.

alter type import_source add value if not exists 'manual_entry';
alter type import_source add value if not exists 'voice_entry';

alter table transactions
  add column if not exists original_text text;

create table if not exists financial_accounts (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  account_key text not null,
  name text not null,
  institution text,
  kind account_kind not null default 'checking',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, account_key)
);

alter table financial_accounts enable row level security;

create policy "financial_accounts_select" on financial_accounts for select
  using (public.is_org_member(organization_id));
create policy "financial_accounts_insert" on financial_accounts for insert
  with check (public.is_org_contributor(organization_id));
create policy "financial_accounts_update" on financial_accounts for update
  using (public.is_org_contributor(organization_id));
create policy "financial_accounts_delete" on financial_accounts for delete
  using (public.is_org_admin(organization_id));

create index if not exists idx_financial_accounts_org_kind
  on financial_accounts(organization_id, kind, archived);

create or replace function public.dashboard_month_summary(
  p_org_id uuid,
  p_month date default date_trunc('month', now())::date
)
returns table(
  month_start date,
  income numeric,
  expenses numeric,
  balance numeric,
  previous_income numeric,
  previous_expenses numeric,
  previous_balance numeric,
  pending_review integer
)
language sql stable security invoker
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_month)::timestamptz as start_at,
      (date_trunc('month', p_month) + interval '1 month')::timestamptz as end_at,
      (date_trunc('month', p_month) - interval '1 month')::timestamptz as prev_start_at
  ),
  current_tx as (
    select t.*
    from transactions t, bounds b
    where t.organization_id = p_org_id
      and t.posted_at >= b.start_at
      and t.posted_at < b.end_at
  ),
  previous_tx as (
    select t.*
    from transactions t, bounds b
    where t.organization_id = p_org_id
      and t.posted_at >= b.prev_start_at
      and t.posted_at < b.start_at
  )
  select
    (select start_at::date from bounds) as month_start,
    coalesce((select sum(amount) from current_tx where amount > 0), 0)::numeric as income,
    coalesce((select sum(abs(amount)) from current_tx where amount < 0), 0)::numeric as expenses,
    coalesce((select sum(amount) from current_tx), 0)::numeric as balance,
    coalesce((select sum(amount) from previous_tx where amount > 0), 0)::numeric as previous_income,
    coalesce((select sum(abs(amount)) from previous_tx where amount < 0), 0)::numeric as previous_expenses,
    coalesce((select sum(amount) from previous_tx), 0)::numeric as previous_balance,
    (select count(*)::integer from current_tx where needs_review = true) as pending_review;
$$;

create or replace function public.expenses_by_category(
  p_org_id uuid,
  p_start date,
  p_end date
)
returns table(category_id uuid, category_name text, total numeric, tx_count integer)
language sql stable security invoker
set search_path = public
as $$
  select
    c.id as category_id,
    coalesce(c.name, 'Sem categoria') as category_name,
    sum(abs(t.amount))::numeric as total,
    count(*)::integer as tx_count
  from transactions t
  left join categories c on c.id = t.category_id
  where t.organization_id = p_org_id
    and t.amount < 0
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
  group by c.id, c.name
  order by total desc;
$$;

create or replace function public.expenses_by_account(
  p_org_id uuid,
  p_start date,
  p_end date
)
returns table(account_id text, account_kind account_kind, account_name text, total numeric, tx_count integer)
language sql stable security invoker
set search_path = public
as $$
  select
    t.account_id,
    t.account_kind,
    coalesce(fa.name, t.account_id) as account_name,
    sum(abs(t.amount))::numeric as total,
    count(*)::integer as tx_count
  from transactions t
  left join financial_accounts fa
    on fa.organization_id = t.organization_id
   and fa.account_key = t.account_id
  where t.organization_id = p_org_id
    and t.amount < 0
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
  group by t.account_id, t.account_kind, fa.name
  order by total desc;
$$;

create or replace function public.largest_expenses(
  p_org_id uuid,
  p_start date,
  p_end date,
  p_limit integer default 10
)
returns table(id uuid, posted_at timestamptz, description text, category_name text, account_id text, amount numeric)
language sql stable security invoker
set search_path = public
as $$
  select
    t.id,
    t.posted_at,
    t.description,
    coalesce(c.name, 'Sem categoria') as category_name,
    t.account_id,
    abs(t.amount)::numeric as amount
  from transactions t
  left join categories c on c.id = t.category_id
  where t.organization_id = p_org_id
    and t.amount < 0
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
  order by abs(t.amount) desc
  limit greatest(p_limit, 1);
$$;

create or replace function public.monthly_comparison(
  p_org_id uuid,
  p_months integer default 6
)
returns table(month_start date, income numeric, expenses numeric, balance numeric)
language sql stable security invoker
set search_path = public
as $$
  with months as (
    select generate_series(
      date_trunc('month', now()) - ((greatest(p_months, 1) - 1) || ' months')::interval,
      date_trunc('month', now()),
      interval '1 month'
    ) as month_start
  )
  select
    m.month_start::date,
    coalesce(sum(t.amount) filter (where t.amount > 0), 0)::numeric as income,
    coalesce(sum(abs(t.amount)) filter (where t.amount < 0), 0)::numeric as expenses,
    coalesce(sum(t.amount), 0)::numeric as balance
  from months m
  left join transactions t
    on t.organization_id = p_org_id
   and t.posted_at >= m.month_start
   and t.posted_at < m.month_start + interval '1 month'
  group by m.month_start
  order by m.month_start;
$$;

create or replace function public.recurring_expenses(
  p_org_id uuid,
  p_start date,
  p_end date
)
returns table(pattern text, occurrences integer, average_amount numeric, total numeric)
language sql stable security invoker
set search_path = public
as $$
  select
    lower(regexp_replace(t.description, '\s+', ' ', 'g')) as pattern,
    count(*)::integer as occurrences,
    avg(abs(t.amount))::numeric as average_amount,
    sum(abs(t.amount))::numeric as total
  from transactions t
  where t.organization_id = p_org_id
    and t.amount < 0
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
  group by lower(regexp_replace(t.description, '\s+', ' ', 'g'))
  having count(*) >= 2
  order by total desc;
$$;

grant execute on function public.dashboard_month_summary(uuid, date) to authenticated;
grant execute on function public.expenses_by_category(uuid, date, date) to authenticated;
grant execute on function public.expenses_by_account(uuid, date, date) to authenticated;
grant execute on function public.largest_expenses(uuid, date, date, integer) to authenticated;
grant execute on function public.monthly_comparison(uuid, integer) to authenticated;
grant execute on function public.recurring_expenses(uuid, date, date) to authenticated;
