-- Conta fixa exibida no Calendário/Dashboard precisa de ícone e cor, iguais
-- aos compromissos do calendário família — em vez de criar mais um par de
-- colunas, herda o ícone/cor já cadastrados na categoria vinculada à conta
-- (a mesma usada em Cadastros > Categorias e na lista de Transações). Sem
-- categoria, o client cai num ícone/cor neutros.

drop function if exists public.recurring_bills_upcoming(uuid, date, date);

create or replace function public.recurring_bills_upcoming(
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
    and o.due_date between p_start and p_end
  order by o.due_date;
$$;

grant execute on function public.recurring_bills_upcoming(uuid, date, date) to authenticated;
