-- Frente 3: planejamento familiar por categoria e mes.

create table if not exists budgets (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  period_month date not null,
  planned_amount numeric(15,2) not null check (planned_amount >= 0),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, category_id, period_month)
);

alter table budgets enable row level security;

create policy "budgets_select" on budgets for select
  using (public.is_org_member(organization_id));
create policy "budgets_insert" on budgets for insert
  with check (public.is_org_contributor(organization_id));
create policy "budgets_update" on budgets for update
  using (public.is_org_contributor(organization_id));
create policy "budgets_delete" on budgets for delete
  using (public.is_org_admin(organization_id));

create index if not exists idx_budgets_org_month
  on budgets(organization_id, period_month, category_id);

create or replace function public.budget_vs_actual(
  p_org_id uuid,
  p_start date,
  p_end date
)
returns table(
  period_month date,
  category_id uuid,
  category_name text,
  category_type category_type,
  planned_amount numeric,
  actual_amount numeric,
  difference_amount numeric,
  difference_percent numeric
)
language sql stable security invoker
set search_path = public
as $$
  with months as (
    select generate_series(
      date_trunc('month', p_start)::date,
      date_trunc('month', p_end)::date,
      interval '1 month'
    )::date as period_month
  ),
  budget_rows as (
    select
      b.period_month,
      b.category_id,
      sum(b.planned_amount)::numeric as planned_amount
    from budgets b
    where b.organization_id = p_org_id
      and b.period_month >= date_trunc('month', p_start)::date
      and b.period_month <= date_trunc('month', p_end)::date
    group by b.period_month, b.category_id
  ),
  actual_rows as (
    select
      date_trunc('month', t.posted_at)::date as period_month,
      t.category_id,
      sum(
        case
          when c.type = 'expense' then abs(t.amount)
          else t.amount
        end
      )::numeric as actual_amount
    from transactions t
    join categories c on c.id = t.category_id
    where t.organization_id = p_org_id
      and t.category_id is not null
      and t.posted_at >= p_start::timestamptz
      and t.posted_at < (p_end::timestamptz + interval '1 day')
    group by date_trunc('month', t.posted_at)::date, t.category_id
  )
  select
    coalesce(br.period_month, ar.period_month, m.period_month) as period_month,
    c.id as category_id,
    c.name as category_name,
    c.type as category_type,
    coalesce(br.planned_amount, 0)::numeric as planned_amount,
    coalesce(ar.actual_amount, 0)::numeric as actual_amount,
    (coalesce(br.planned_amount, 0) - coalesce(ar.actual_amount, 0))::numeric as difference_amount,
    case
      when coalesce(br.planned_amount, 0) = 0 then null
      else round(((coalesce(ar.actual_amount, 0) - br.planned_amount) / br.planned_amount) * 100, 2)
    end::numeric as difference_percent
  from months m
  join categories c on c.organization_id = p_org_id
  left join budget_rows br on br.period_month = m.period_month and br.category_id = c.id
  left join actual_rows ar on ar.period_month = m.period_month and ar.category_id = c.id
  where coalesce(br.planned_amount, 0) <> 0
     or coalesce(ar.actual_amount, 0) <> 0
  order by m.period_month desc, c.name;
$$;

grant execute on function public.budget_vs_actual(uuid, date, date) to authenticated;
