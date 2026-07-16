-- Realized (actual) amounts per category/month, for any category — not just
-- ones that already have a budget row. Rolls up each category's own
-- transactions plus all descendants', mirroring the category_descendants
-- pattern in budget_vs_actual (20240101000013), but closed over every
-- category in the org instead of only budgeted scopes.
create or replace function public.actuals_by_scope_and_month(
  p_org_id uuid,
  p_start date,
  p_end date
)
returns table(
  scope_type text,
  category_id uuid,
  budget_month integer,
  actual_amount numeric
)
language sql stable security invoker
set search_path = public
as $$
  with recursive category_descendants as (
    select c.id as ancestor_id, c.id as descendant_id
    from categories c
    where c.organization_id = p_org_id

    union all

    select cd.ancestor_id, child.id
    from category_descendants cd
    join categories child on child.parent_id = cd.descendant_id
  ),
  txn_months as (
    select t.category_id, t.amount, extract(month from t.posted_at)::integer as budget_month
    from transactions t
    where t.organization_id = p_org_id
      and t.posted_at >= p_start::timestamptz
      and t.posted_at < (p_end::timestamptz + interval '1 day')
  )
  select 'category'::text, cd.ancestor_id, tm.budget_month, sum(abs(tm.amount))::numeric
  from category_descendants cd
  join txn_months tm on tm.category_id = cd.descendant_id
  group by cd.ancestor_id, tm.budget_month

  union all

  select 'macro_income'::text, null::uuid, tm.budget_month, sum(tm.amount)::numeric
  from txn_months tm
  where tm.amount > 0
  group by tm.budget_month

  union all

  select 'macro_expense'::text, null::uuid, tm.budget_month, sum(abs(tm.amount))::numeric
  from txn_months tm
  where tm.amount < 0
  group by tm.budget_month;
$$;

grant execute on function public.actuals_by_scope_and_month(uuid, date, date) to authenticated;
