-- Frente 4: relatorios filtrados por usuario criador do lancamento.

create or replace function public.expenses_by_category_for_user(
  p_org_id uuid,
  p_start date,
  p_end date,
  p_created_by uuid default null
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
    and (p_created_by is null or t.created_by = p_created_by)
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
  group by c.id, c.name
  order by total desc;
$$;

create or replace function public.expenses_by_account_for_user(
  p_org_id uuid,
  p_start date,
  p_end date,
  p_created_by uuid default null
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
    and (p_created_by is null or t.created_by = p_created_by)
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
  group by t.account_id, t.account_kind, fa.name
  order by total desc;
$$;

create or replace function public.largest_expenses_for_user(
  p_org_id uuid,
  p_start date,
  p_end date,
  p_limit integer default 10,
  p_created_by uuid default null
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
    and (p_created_by is null or t.created_by = p_created_by)
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
  order by abs(t.amount) desc
  limit greatest(p_limit, 1);
$$;

create or replace function public.monthly_comparison_for_user(
  p_org_id uuid,
  p_months integer default 6,
  p_created_by uuid default null
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
   and (p_created_by is null or t.created_by = p_created_by)
   and t.posted_at >= m.month_start
   and t.posted_at < m.month_start + interval '1 month'
  group by m.month_start
  order by m.month_start;
$$;

create or replace function public.monthly_spending_by_creator(
  p_org_id uuid,
  p_month date default date_trunc('month', now())::date
)
returns table(created_by uuid, total numeric, tx_count integer)
language sql stable security invoker
set search_path = public
as $$
  select
    t.created_by,
    sum(abs(t.amount))::numeric as total,
    count(*)::integer as tx_count
  from transactions t
  where t.organization_id = p_org_id
    and t.amount < 0
    and t.posted_at >= date_trunc('month', p_month)::timestamptz
    and t.posted_at < (date_trunc('month', p_month) + interval '1 month')::timestamptz
  group by t.created_by
  order by total desc;
$$;

grant execute on function public.expenses_by_category_for_user(uuid, date, date, uuid) to authenticated;
grant execute on function public.expenses_by_account_for_user(uuid, date, date, uuid) to authenticated;
grant execute on function public.largest_expenses_for_user(uuid, date, date, integer, uuid) to authenticated;
grant execute on function public.monthly_comparison_for_user(uuid, integer, uuid) to authenticated;
grant execute on function public.monthly_spending_by_creator(uuid, date) to authenticated;
