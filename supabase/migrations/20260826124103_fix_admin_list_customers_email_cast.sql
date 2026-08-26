-- Corrige "structure of query does not match function result type": em
-- RETURNS TABLE o tipo precisa bater exatamente, e auth.users.email é
-- varchar, não text (a diferença passa despercebida num SELECT comum, mas
-- não dentro de uma função plpgsql).

create or replace function public.admin_list_customers()
returns table (
  organization_id uuid,
  organization_name text,
  owner_email text,
  plan_name text,
  status text,
  billing_cycle text,
  payment_method text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  paid_until timestamptz,
  next_due_date timestamptz,
  amount_cents integer,
  base_amount_cents integer,
  discount_amount_cents integer,
  promo_code text,
  discount_percent numeric,
  cancelled_at timestamptz,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_ticlio_staff() then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    cs.organization_id,
    o.name::text,
    u.email::text,
    cs.plan_name,
    cs.status,
    cs.billing_cycle,
    cs.payment_method,
    cs.trial_started_at,
    cs.trial_ends_at,
    cs.paid_until,
    cs.next_due_date,
    cs.amount_cents,
    cs.base_amount_cents,
    cs.discount_amount_cents,
    cs.promo_code,
    cs.discount_percent,
    cs.cancelled_at,
    cs.created_at
  from public.commercial_subscriptions cs
  join public.organizations o on o.id = cs.organization_id
  join auth.users u on u.id = cs.owner_user_id
  order by cs.created_at desc;
end;
$$;

revoke all on function public.admin_list_customers() from public;
grant execute on function public.admin_list_customers() to authenticated;
