-- Frente 6/7: saldo inicial de conta corrente e limite/fechamento de cartão,
-- mais cálculos determinísticos de saldo bancário e visão consolidada do cartão.

alter table financial_accounts
  add column if not exists initial_balance numeric(15,2),
  add column if not exists initial_balance_date date,
  add column if not exists closing_day smallint check (closing_day between 1 and 31),
  add column if not exists due_day smallint check (due_day between 1 and 31),
  add column if not exists credit_limit numeric(15,2);

-- Mês de competência de um lançamento de cartão: se o dia do lançamento é
-- posterior ao dia de fechamento, ele cai na fatura do mês seguinte; caso
-- contrário, cai na fatura do mês corrente. Mesma regra usada no cliente
-- (src/lib/finance/installments.ts) para agendar parcelas — mantidas em
-- paralelo porque uma roda no banco (relatórios) e outra no navegador
-- (antes de gravar a transação).
create or replace function public.competence_month(p_posted_at date, p_closing_day smallint)
returns date
language sql
immutable
as $$
  select case
    when p_closing_day is null then date_trunc('month', p_posted_at)::date
    when extract(day from p_posted_at)::int > p_closing_day
      then (date_trunc('month', p_posted_at) + interval '1 month')::date
    else date_trunc('month', p_posted_at)::date
  end;
$$;

-- Saldo bancário determinístico: saldo inicial + soma de lançamentos da
-- conta corrente posteriores à data de referência. Sem IA.
create or replace function public.account_balances(p_org_id uuid)
returns table(
  account_id uuid,
  account_key text,
  name text,
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
    fa.initial_balance,
    fa.initial_balance_date,
    coalesce(fa.initial_balance, 0) + coalesce((
      select sum(t.amount) from transactions t
      where t.organization_id = p_org_id
        and t.account_id = fa.account_key
        and t.account_kind = 'checking'
        and fa.initial_balance_date is not null
        and t.posted_at::date > fa.initial_balance_date
    ), 0) as current_balance
  from financial_accounts fa
  where fa.organization_id = p_org_id
    and fa.kind = 'checking'
    and fa.archived = false
  order by fa.name;
$$;

-- Visão consolidada de cartão: fatura do mês vigente, parcelas futuras em
-- aberto e limite comprometido (fatura atual + parcelas futuras). Também
-- determinístico, direto de transactions/installment_plan_id.
create or replace function public.card_summary(p_org_id uuid, p_reference_date date default current_date)
returns table(
  account_id uuid,
  account_key text,
  name text,
  credit_limit numeric,
  closing_day smallint,
  due_day smallint,
  current_invoice_total numeric,
  future_installments_total numeric,
  limit_used numeric,
  limit_available numeric
)
language sql stable security invoker
set search_path = public
as $$
  select
    c.id as account_id,
    c.account_key,
    c.name,
    c.credit_limit,
    c.closing_day,
    c.due_day,
    coalesce(agg.current_invoice_total, 0) as current_invoice_total,
    coalesce(agg.future_installments_total, 0) as future_installments_total,
    coalesce(agg.current_invoice_total, 0) + coalesce(agg.future_installments_total, 0) as limit_used,
    case
      when c.credit_limit is null then null
      else c.credit_limit
        - (coalesce(agg.current_invoice_total, 0) + coalesce(agg.future_installments_total, 0))
    end as limit_available
  from financial_accounts c
  left join lateral (
    select
      sum(abs(t.amount)) filter (
        where public.competence_month(t.posted_at::date, c.closing_day)
          = public.competence_month(p_reference_date, c.closing_day)
      ) as current_invoice_total,
      sum(abs(t.amount)) filter (
        where t.installment_plan_id is not null
          and public.competence_month(t.posted_at::date, c.closing_day)
            > public.competence_month(p_reference_date, c.closing_day)
      ) as future_installments_total
    from transactions t
    where t.organization_id = p_org_id
      and t.account_id = c.account_key
      and t.account_kind = 'credit_card'
  ) agg on true
  where c.organization_id = p_org_id
    and c.kind = 'credit_card'
    and c.archived = false
  order by c.name;
$$;

grant execute on function public.competence_month(date, smallint) to authenticated;
grant execute on function public.account_balances(uuid) to authenticated;
grant execute on function public.card_summary(uuid, date) to authenticated;
