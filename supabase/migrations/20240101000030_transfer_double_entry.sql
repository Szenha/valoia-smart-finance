-- Transferências como partida dobrada: até aqui uma transferência era uma
-- única linha em `transactions`, sempre com sinal positivo (tratada como
-- receita) e sem conta de destino. Agora uma transferência grava DUAS
-- linhas ligadas por `transfer_group_id` — uma de débito (-valor) na conta
-- de origem, uma de crédito (+valor) na conta de destino, ambas
-- type = 'MANUAL_TRANSFER'.
--
-- Toda função de agregação de RECEITA/DESPESA precisa excluir
-- MANUAL_TRANSFER, senão a mesma transferência aparece como despesa (na
-- origem) e como receita (no destino) nos relatórios. `account_balances` e
-- `card_summary` são a exceção deliberada: uma transferência deve
-- continuar movimentando o saldo das duas contas, então essas duas NÃO
-- recebem o filtro — só os agregados de receita/despesa/categoria/
-- orçamento.

alter table transactions
  add column if not exists transfer_group_id uuid;

create index if not exists idx_transactions_transfer_group
  on transactions(transfer_group_id)
  where transfer_group_id is not null;

-- dashboard_month_summary (única versão: 20240101000007)
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
      and t.type <> 'MANUAL_TRANSFER'
      and t.posted_at >= b.start_at
      and t.posted_at < b.end_at
  ),
  previous_tx as (
    select t.*
    from transactions t, bounds b
    where t.organization_id = p_org_id
      and t.type <> 'MANUAL_TRANSFER'
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

-- expenses_by_category_for_user (última versão: 20240101000013)
-- expenses_by_category (só delega pra expenses_by_category_for_user, não
-- precisa ser redeclarada).
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
    and t.type <> 'MANUAL_TRANSFER'
    and t.amount < 0
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
    and (p_created_by is null or t.created_by = p_created_by)
  group by c.id
  order by total desc;
$$;

-- expenses_by_account (única versão: 20240101000007)
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
    and t.type <> 'MANUAL_TRANSFER'
    and t.amount < 0
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
  group by t.account_id, t.account_kind, fa.name
  order by total desc;
$$;

-- expenses_by_account_for_user (única versão: 20240101000012)
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
    and t.type <> 'MANUAL_TRANSFER'
    and t.amount < 0
    and (p_created_by is null or t.created_by = p_created_by)
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
  group by t.account_id, t.account_kind, fa.name
  order by total desc;
$$;

-- largest_expenses (única versão: 20240101000007)
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
    and t.type <> 'MANUAL_TRANSFER'
    and t.amount < 0
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
  order by abs(t.amount) desc
  limit greatest(p_limit, 1);
$$;

-- largest_expenses_for_user (última versão: 20240101000013)
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
    and t.type <> 'MANUAL_TRANSFER'
    and t.amount < 0
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
    and (p_created_by is null or t.created_by = p_created_by)
  order by abs(t.amount) desc
  limit p_limit;
$$;

-- recurring_expenses (única versão: 20240101000007)
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
    and t.type <> 'MANUAL_TRANSFER'
    and t.amount < 0
    and t.posted_at >= p_start::timestamptz
    and t.posted_at < (p_end::timestamptz + interval '1 day')
  group by lower(regexp_replace(t.description, '\s+', ' ', 'g'))
  having count(*) >= 2
  order by total desc;
$$;

-- monthly_comparison_for_user (única versão: 20240101000012)
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
   and t.type <> 'MANUAL_TRANSFER'
   and (p_created_by is null or t.created_by = p_created_by)
   and t.posted_at >= m.month_start
   and t.posted_at < m.month_start + interval '1 month'
  group by m.month_start
  order by m.month_start;
$$;

-- monthly_spending_by_creator (única versão: 20240101000012)
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
    and t.type <> 'MANUAL_TRANSFER'
    and t.amount < 0
    and t.posted_at >= date_trunc('month', p_month)::timestamptz
    and t.posted_at < (date_trunc('month', p_month) + interval '1 month')::timestamptz
  group by t.created_by
  order by total desc;
$$;

-- budget_vs_actual (última versão: 20240101000013, com scope_type)
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
      and t.type <> 'MANUAL_TRANSFER'
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

-- actuals_by_scope_and_month (única versão: 20240101000022)
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
      and t.type <> 'MANUAL_TRANSFER'
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
