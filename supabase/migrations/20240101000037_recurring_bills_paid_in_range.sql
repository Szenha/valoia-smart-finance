-- Contas fixas pagas num período, por data de pagamento (paid_at) — não por
-- due_date. Uma conta vencida em um mês pode ser paga em outro (o caso que
-- motivou isso: dar baixa numa conta atrasada some da tela sem essa seção,
-- já que "Próximos vencimentos" só lista pendentes). Mesma forma de retorno
-- de recurring_bills_upcoming, para reuso direto no client.
--
-- `paid_at::date` sozinho depende do timezone da sessão do Postgres — usa
-- `at time zone 'utc'` explicitamente pra sempre extrair a data de calendário
-- em UTC, igual ao client faz com paid_at.slice(0, 10) (ver formatDateBR em
-- date-utils.ts). Sem isso, uma sessão com timezone diferente de UTC podia
-- classificar o pagamento no dia anterior ao que o usuário escolheu.
create or replace function public.recurring_bills_paid_in_range(
  p_org_id uuid,
  p_start date,
  p_end date
)
returns table(
  id uuid,
  recurring_bill_id uuid,
  bill_name text,
  category_id uuid,
  category_name text,
  category_icon text,
  category_color text,
  account_id text,
  due_date date,
  expected_amount numeric,
  status text,
  paid_transaction_id uuid,
  paid_amount numeric,
  paid_at timestamptz
)
language sql stable security invoker
set search_path = public
as $$
  select
    o.id,
    o.recurring_bill_id,
    b.name as bill_name,
    b.category_id,
    public.category_full_path(b.category_id) as category_name,
    c.icon as category_icon,
    c.color as category_color,
    b.account_id,
    o.due_date,
    o.expected_amount,
    o.status,
    o.paid_transaction_id,
    o.paid_amount,
    o.paid_at
  from recurring_bill_occurrences o
  join recurring_bills b on b.id = o.recurring_bill_id
  left join categories c on c.id = b.category_id
  where o.organization_id = p_org_id
    and o.status = 'paid'
    and o.paid_at is not null
    and (o.paid_at at time zone 'utc')::date between p_start and p_end
  order by o.paid_at desc;
$$;

grant execute on function public.recurring_bills_paid_in_range(uuid, date, date) to authenticated;
