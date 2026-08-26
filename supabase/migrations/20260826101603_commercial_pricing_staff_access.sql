-- Comercial v2: preço administrável, contrato imutável por assinatura,
-- separação real entre ciclo (mensal/anual) e forma de pagamento
-- (pix/cartão), e um backoffice restrito à conta staff do Ticlio.

-- ============================================================
-- Staff gate
-- ============================================================

create or replace function public.is_ticlio_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and email = 'szenha30@gmail.com'
  );
$$;

-- ============================================================
-- commercial_pricing — fonte única de preço de tabela
-- ============================================================

create table if not exists public.commercial_pricing (
  id uuid primary key default uuid_generate_v4(),
  billing_cycle text not null unique check (billing_cycle in ('monthly', 'annual')),
  price_cents integer not null check (price_cents > 0),
  active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.commercial_pricing enable row level security;

drop policy if exists "commercial_pricing_select" on public.commercial_pricing;
create policy "commercial_pricing_select"
  on public.commercial_pricing for select
  using (auth.uid() is not null);

drop policy if exists "commercial_pricing_insert" on public.commercial_pricing;
create policy "commercial_pricing_insert"
  on public.commercial_pricing for insert
  with check (public.is_ticlio_staff());

drop policy if exists "commercial_pricing_update" on public.commercial_pricing;
create policy "commercial_pricing_update"
  on public.commercial_pricing for update
  using (public.is_ticlio_staff())
  with check (public.is_ticlio_staff());

grant select on public.commercial_pricing to authenticated;
grant insert, update on public.commercial_pricing to authenticated;

-- Seed com os valores já em produção hoje, pra não alterar preço de
-- ninguém só por rodar esta migration.
insert into public.commercial_pricing (billing_cycle, price_cents, active)
values
  ('monthly', 2290, true),
  ('annual', 23990, true)
on conflict (billing_cycle) do nothing;

-- ============================================================
-- commercial_subscriptions — contrato completo por assinatura
-- ============================================================

alter table public.commercial_subscriptions
  add column if not exists billing_cycle text check (billing_cycle in ('monthly', 'annual')),
  add column if not exists payment_method text check (payment_method in ('pix', 'credit_card')),
  add column if not exists asaas_customer_id text,
  add column if not exists asaas_subscription_id text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists next_due_date timestamptz;

-- "cancelled" como estado terminal explícito, distinto de vencimento por
-- tempo (que já é tratado em runtime por effectiveStatus()).
alter table public.commercial_subscriptions drop constraint if exists commercial_subscriptions_status_check;
alter table public.commercial_subscriptions add constraint commercial_subscriptions_status_check
  check (
    status in (
      'trial_active',
      'trial_expired',
      'awaiting_pix_confirmation',
      'active_paid',
      'payment_overdue',
      'blocked_readonly',
      'cancelled'
    )
  );

-- ============================================================
-- promo_codes — gestão passa a ser só da conta staff
-- ============================================================

drop policy if exists "promo_codes_select_admin" on public.promo_codes;
create policy "promo_codes_select_staff"
  on public.promo_codes for select
  using (public.is_ticlio_staff());

drop policy if exists "promo_codes_insert_admin" on public.promo_codes;
create policy "promo_codes_insert_staff"
  on public.promo_codes for insert
  with check (public.is_ticlio_staff());

drop policy if exists "promo_codes_update_admin" on public.promo_codes;
create policy "promo_codes_update_staff"
  on public.promo_codes for update
  using (public.is_ticlio_staff())
  with check (public.is_ticlio_staff());

-- ============================================================
-- Painel Comercial — leitura cross-org protegida na própria função
-- ============================================================

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
    o.name,
    u.email,
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

-- ============================================================
-- apply_promo_code_to_subscription — base de cálculo passa a ser
-- commercial_pricing (por ciclo), não mais um valor vindo do cliente
-- nem promo_codes.annual_price_cents (coluna mantida, sem uso a partir
-- daqui — evita migration destrutiva).
-- ============================================================

-- Assinatura antiga tinha o 3º parâmetro como integer (valor vindo do
-- cliente); create or replace não troca a assinatura de uma função, então
-- a versão velha precisa ser removida explicitamente.
drop function if exists public.apply_promo_code_to_subscription(uuid, text, integer);

create or replace function public.apply_promo_code_to_subscription(
  p_org_id uuid,
  p_code text,
  p_billing_cycle text
)
returns table (
  code text,
  discount_percent numeric,
  base_amount_cents integer,
  discount_amount_cents integer,
  final_amount_cents integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code public.promo_codes%rowtype;
  v_base_amount_cents integer;
  v_discount_amount_cents integer;
  v_final_amount_cents integer;
begin
  if v_user_id is null then
    raise exception 'Nao autenticado.';
  end if;

  if not public.is_org_admin(p_org_id) then
    raise exception 'Sem permissao para aplicar codigo neste workspace.';
  end if;

  if p_billing_cycle not in ('monthly', 'annual') then
    raise exception 'Ciclo de cobranca invalido.';
  end if;

  select *
    into v_code
  from public.promo_codes pc
  where pc.code = upper(trim(p_code))
    and pc.active
    and (pc.valid_until is null or pc.valid_until >= now())
    and (pc.max_redemptions is null or pc.redemption_count < pc.max_redemptions)
  limit 1;

  if not found then
    raise exception 'Codigo promocional invalido ou expirado.';
  end if;

  select cp.price_cents
    into v_base_amount_cents
  from public.commercial_pricing cp
  where cp.billing_cycle = p_billing_cycle
    and cp.active;

  if v_base_amount_cents is null then
    raise exception 'Preco de tabela indisponivel para este ciclo.';
  end if;

  v_discount_amount_cents := round(v_base_amount_cents * (v_code.discount_percent / 100.0));
  v_final_amount_cents := greatest(v_base_amount_cents - v_discount_amount_cents, 0);

  update public.commercial_subscriptions
    set plan_name = v_code.applies_to_plan,
        status = 'awaiting_pix_confirmation',
        promo_code_id = v_code.id,
        promo_code = v_code.code,
        discount_percent = v_code.discount_percent,
        base_amount_cents = v_base_amount_cents,
        discount_amount_cents = v_discount_amount_cents,
        amount_cents = v_final_amount_cents,
        updated_at = now()
  where organization_id = p_org_id;

  update public.promo_codes
    set redemption_count = redemption_count + 1,
        updated_at = now()
  where id = v_code.id;

  return query select
    v_code.code,
    v_code.discount_percent,
    v_base_amount_cents,
    v_discount_amount_cents,
    v_final_amount_cents;
end;
$$;

revoke all on function public.apply_promo_code_to_subscription(uuid, text, text) from public;
grant execute on function public.apply_promo_code_to_subscription(uuid, text, text) to authenticated;
