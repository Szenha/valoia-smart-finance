-- Extend account_balances to also cover investment-kind accounts, using the
-- exact same "initial balance + transactions posted after the reference
-- date" formula already used for checking accounts — investment accounts
-- gained an initial_balance field but never a computed running balance,
-- so "Patrimônio total" on the dashboard had nothing to sum for them.

drop function if exists public.account_balances(uuid);

create or replace function public.account_balances(p_org_id uuid)
returns table(
  account_id uuid,
  account_key text,
  name text,
  kind account_kind,
  initial_balance numeric,
  initial_balance_date date,
  current_balance numeric
)
language sql stable security invoker
set search_path = public
as $$
  select
    fa.id as account_id,
    fa.account_key,
    fa.name,
    fa.kind,
    fa.initial_balance,
    fa.initial_balance_date,
    coalesce(fa.initial_balance, 0) + coalesce((
      select sum(t.amount) from transactions t
      where t.organization_id = p_org_id
        and t.account_id = fa.account_key
        and t.account_kind = fa.kind
        and fa.initial_balance_date is not null
        and t.posted_at::date > fa.initial_balance_date
    ), 0) as current_balance
  from financial_accounts fa
  where fa.organization_id = p_org_id
    and fa.kind in ('checking', 'investment')
    and fa.archived = false
  order by fa.kind, fa.name;
$$;

grant execute on function public.account_balances(uuid) to authenticated;
