-- Planejamento com escopo variavel: macro receita/despesa, categoria ou subcategoria.

alter table budgets
  add column if not exists scope_type text,
  add column if not exists scope_category_key uuid,
  add column if not exists budget_year integer,
  add column if not exists budget_month integer,
  add column if not exists default_amount numeric(15,2),
  add column if not exists is_manual_adjustment boolean not null default false;

update budgets
set
  scope_type = coalesce(scope_type, 'category'),
  scope_category_key = coalesce(
    scope_category_key,
    category_id,
    '00000000-0000-0000-0000-000000000000'::uuid
  ),
  budget_year = coalesce(budget_year, extract(year from period_month)::integer),
  budget_month = coalesce(budget_month, extract(month from period_month)::integer),
  default_amount = coalesce(default_amount, planned_amount)
where scope_type is null
   or budget_year is null
   or budget_month is null
   or default_amount is null;

alter table budgets
  alter column scope_type set not null,
  alter column scope_category_key set not null,
  alter column budget_year set not null,
  alter column budget_month set not null,
  alter column default_amount set not null,
  alter column category_id drop not null;

alter table budgets
  drop constraint if exists budgets_organization_id_category_id_period_month_key,
  drop constraint if exists budgets_scope_type_check,
  add constraint budgets_scope_type_check
    check (scope_type in ('macro_income', 'macro_expense', 'category')),
  drop constraint if exists budgets_scope_category_check,
  add constraint budgets_scope_category_check
    check (
      (scope_type in ('macro_income', 'macro_expense') and category_id is null)
      or (scope_type = 'category' and category_id is not null)
    ),
  drop constraint if exists budgets_budget_month_check,
  add constraint budgets_budget_month_check check (budget_month between 1 and 12),
  drop constraint if exists budgets_budget_year_check,
  add constraint budgets_budget_year_check check (budget_year between 2000 and 2100);

drop index if exists idx_budgets_org_month;
create index if not exists idx_budgets_org_year_month
  on budgets(organization_id, budget_year, budget_month, scope_type, category_id);

drop index if exists budgets_scope_month_unique;
create unique index budgets_scope_month_unique
  on budgets(
    organization_id,
    scope_type,
    scope_category_key,
    budget_year,
    budget_month
  );

create or replace function public.category_full_path(p_category_id uuid)
returns text
language sql stable security invoker
set search_path = public
as $$
  with recursive tree as (
    select c.id, c.name, c.parent_id, 1 as depth
    from categories c
    where c.id = p_category_id

    union all

    select parent.id, parent.name, parent.parent_id, tree.depth + 1
    from categories parent
    join tree on tree.parent_id = parent.id
  )
  select string_agg(name, ' > ' order by depth desc)
  from tree;
$$;

drop function if exists public.budget_vs_actual(uuid, date, date);

create or replace function public.budget_vs_actual(
  p_org_id uuid,
  p_start date,
  p_end date
)
returns table(
  period_month date,
  scope_type text,
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
  with recursive budget_rows as (
    select
      b.id,
      b.scope_type,
      b.category_id,
      b.period_month,
      b.planned_amount,
      b.budget_year,
      b.budget_month
    from budgets b
    where b.organization_id = p_org_id
      and b.period_month >= date_trunc('month', p_start)::date
      and b.period_month <= date_trunc('month', p_end)::date
  ),
  category_descendants as (
    select br.id as budget_id, c.id as category_id
    from budget_rows br
    join categories c on c.id = br.category_id
    where br.scope_type = 'category'

    union all

    select cd.budget_id, child.id
    from category_descendants cd
    join categories child on child.parent_id = cd.category_id
  ),
  actual_rows as (
    select
      br.id as budget_id,
      sum(
        case
          when br.scope_type = 'macro_income' and t.amount > 0 then t.amount
          when br.scope_type = 'macro_expense' and t.amount < 0 then abs(t.amount)
          when br.scope_type = 'category' and t.amount < 0 then abs(t.amount)
          when br.scope_type = 'category' and t.amount > 0 then t.amount
          else 0
        end
      )::numeric as actual_amount
    from budget_rows br
    left join transactions t
      on t.organization_id = p_org_id
      and date_trunc('month', t.posted_at)::date = br.period_month
      and (
        br.scope_type in ('macro_income', 'macro_expense')
        or exists (
          select 1
          from category_descendants cd
          where cd.budget_id = br.id
            and cd.category_id = t.category_id
        )
      )
    group by br.id
  )
  select
    br.period_month,
    br.scope_type,
    br.category_id,
    case
      when br.scope_type = 'macro_income' then 'Receita total'
      when br.scope_type = 'macro_expense' then 'Despesa total'
      else public.category_full_path(br.category_id)
    end as category_name,
    case
      when br.scope_type = 'macro_income' then 'income'::category_type
      when br.scope_type = 'macro_expense' then 'expense'::category_type
      else c.type
    end as category_type,
    br.planned_amount,
    coalesce(ar.actual_amount, 0)::numeric as actual_amount,
    (br.planned_amount - coalesce(ar.actual_amount, 0))::numeric as difference_amount,
    case
      when br.planned_amount = 0 then null
      else round(((coalesce(ar.actual_amount, 0) - br.planned_amount) / br.planned_amount) * 100, 2)
    end::numeric as difference_percent
  from budget_rows br
  left join categories c on c.id = br.category_id
  left join actual_rows ar on ar.budget_id = br.id
  order by br.period_month desc, br.scope_type, category_name;
$$;

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
    coalesce(public.category_full_path(c.id), 'Sem categoria') as category_name,
    sum(abs(t.amount))::numeric as total,
    count(*)::integer as tx_count
  from transactions t
  left join categories c on c.id = t.category_id
  where t.organization_id = p_org_id
    and t.amount < 0
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
    and (p_created_by is null or t.created_by = p_created_by)
  group by c.id
  order by total desc;
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
  select *
  from public.expenses_by_category_for_user(p_org_id, p_start, p_end, null);
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
    coalesce(public.category_full_path(c.id), 'Sem categoria') as category_name,
    t.account_id,
    abs(t.amount)::numeric as amount
  from transactions t
  left join categories c on c.id = t.category_id
  where t.organization_id = p_org_id
    and t.amount < 0
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
    and (p_created_by is null or t.created_by = p_created_by)
  order by abs(t.amount) desc
  limit p_limit;
$$;

grant execute on function public.category_full_path(uuid) to authenticated;
grant execute on function public.budget_vs_actual(uuid, date, date) to authenticated;
grant execute on function public.expenses_by_category(uuid, date, date) to authenticated;
grant execute on function public.expenses_by_category_for_user(uuid, date, date, uuid) to authenticated;
grant execute on function public.largest_expenses_for_user(uuid, date, date, integer, uuid) to authenticated;
