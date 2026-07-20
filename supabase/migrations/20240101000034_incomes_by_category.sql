-- Espelha expenses_by_category(_for_user) (20240101000007/20240101000013),
-- mas pro lado de receita — faltava um jeito de ver "Receitas por
-- categoria" no Dashboard/Relatórios, só existia o de despesas.

create or replace function public.incomes_by_category_for_user(
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
    sum(t.amount)::numeric as total,
    count(*)::integer as tx_count
  from transactions t
  left join categories c on c.id = t.category_id
  where t.organization_id = p_org_id
    and t.type <> 'MANUAL_TRANSFER'
    and t.amount > 0
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
    and (p_created_by is null or t.created_by = p_created_by)
  group by c.id
  order by total desc;
$$;

create or replace function public.incomes_by_category(
  p_org_id uuid,
  p_start date,
  p_end date
)
returns table(category_id uuid, category_name text, total numeric, tx_count integer)
language sql stable security invoker
set search_path = public
as $$
  select * from public.incomes_by_category_for_user(p_org_id, p_start, p_end, null);
$$;

grant execute on function public.incomes_by_category_for_user(uuid, date, date, uuid) to authenticated;
grant execute on function public.incomes_by_category(uuid, date, date) to authenticated;
