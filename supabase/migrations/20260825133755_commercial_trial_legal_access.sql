-- Commercial readiness layer: trial, Pix/manual subscription state and legal acceptance.
--
-- Existing organizations are treated as internal/family access so this migration
-- does not lock the current personal workspace. New organizations start in a
-- 30-day individual trial.

create table if not exists public.commercial_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  plan_name text not null default 'trial'
    check (plan_name in ('trial', 'individual', 'family', 'internal')),
  status text not null default 'trial_active'
    check (
      status in (
        'trial_active',
        'trial_expired',
        'awaiting_pix_confirmation',
        'active_paid',
        'payment_overdue',
        'blocked_readonly'
      )
    ),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '30 days'),
  paid_until timestamptz,
  amount_cents integer,
  base_amount_cents integer,
  discount_amount_cents integer,
  promo_code_id uuid,
  promo_code text,
  discount_percent numeric(5,2),
  pix_reference text,
  payment_confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.commercial_subscriptions enable row level security;

drop policy if exists "commercial_subscriptions_select" on public.commercial_subscriptions;
create policy "commercial_subscriptions_select"
  on public.commercial_subscriptions for select
  using (public.is_org_member(organization_id));

drop policy if exists "commercial_subscriptions_insert" on public.commercial_subscriptions;
create policy "commercial_subscriptions_insert"
  on public.commercial_subscriptions for insert
  with check (public.is_org_admin(organization_id));

drop policy if exists "commercial_subscriptions_update" on public.commercial_subscriptions;
create policy "commercial_subscriptions_update"
  on public.commercial_subscriptions for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

grant select, insert, update on public.commercial_subscriptions to authenticated;

create table if not exists public.promo_codes (
  id uuid primary key default uuid_generate_v4(),
  -- Workspace administrativo/comercial que criou o codigo. O cliente que usa
  -- o cupom tera outro organization_id em commercial_subscriptions.
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  description text,
  discount_percent numeric(5,2) not null
    check (discount_percent > 0 and discount_percent <= 100),
  applies_to_plan text not null default 'family'
    check (applies_to_plan in ('individual', 'family')),
  annual_price_cents integer check (annual_price_cents is null or annual_price_cents > 0),
  active boolean not null default true,
  valid_until timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code),
  unique (organization_id, code)
);

alter table public.promo_codes enable row level security;

drop policy if exists "promo_codes_select_admin" on public.promo_codes;
create policy "promo_codes_select_admin"
  on public.promo_codes for select
  using (public.is_org_admin(organization_id));

drop policy if exists "promo_codes_insert_admin" on public.promo_codes;
create policy "promo_codes_insert_admin"
  on public.promo_codes for insert
  with check (public.is_org_admin(organization_id) and (select auth.uid()) = created_by);

drop policy if exists "promo_codes_update_admin" on public.promo_codes;
create policy "promo_codes_update_admin"
  on public.promo_codes for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

grant select, insert, update on public.promo_codes to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'commercial_subscriptions_promo_code_id_fkey'
      and conrelid = 'public.commercial_subscriptions'::regclass
  ) then
    alter table public.commercial_subscriptions
      add constraint commercial_subscriptions_promo_code_id_fkey
      foreign key (promo_code_id) references public.promo_codes(id) on delete set null;
  end if;
end;
$$;

create table if not exists public.legal_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  ai_notice_version text not null,
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.legal_acceptances enable row level security;

drop policy if exists "legal_acceptances_select_self" on public.legal_acceptances;
create policy "legal_acceptances_select_self"
  on public.legal_acceptances for select
  using ((select auth.uid()) = user_id);

drop policy if exists "legal_acceptances_insert_self" on public.legal_acceptances;
create policy "legal_acceptances_insert_self"
  on public.legal_acceptances for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "legal_acceptances_update_self" on public.legal_acceptances;
create policy "legal_acceptances_update_self"
  on public.legal_acceptances for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.legal_acceptances to authenticated;

create or replace function public.ensure_commercial_subscription_for_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.commercial_subscriptions (
    organization_id,
    owner_user_id,
    plan_name,
    status,
    trial_started_at,
    trial_ends_at
  )
  values (
    new.id,
    new.owner_id,
    'trial',
    'trial_active',
    now(),
    now() + interval '30 days'
  )
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_ensure_commercial_subscription_for_org'
      and tgrelid = 'public.organizations'::regclass
  ) then
    create trigger trg_ensure_commercial_subscription_for_org
      after insert on public.organizations
      for each row execute function public.ensure_commercial_subscription_for_org();
  end if;
end;
$$;

insert into public.commercial_subscriptions (
  organization_id,
  owner_user_id,
  plan_name,
  status,
  trial_started_at,
  trial_ends_at,
  paid_until,
  notes
)
select
  o.id,
  o.owner_id,
  'family',
  'active_paid',
  coalesce(o.created_at, now()),
  coalesce(o.created_at, now()) + interval '30 days',
  '2099-12-31 23:59:59+00'::timestamptz,
  'Backfill: existing organizations kept unlocked for current/internal use.'
from public.organizations o
where o.owner_id is not null
on conflict (organization_id) do nothing;

create or replace function public.accept_required_legal_documents(
  p_terms_version text,
  p_privacy_version text,
  p_ai_notice_version text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Nao autenticado.';
  end if;

  insert into public.legal_acceptances (
    user_id,
    terms_version,
    privacy_version,
    ai_notice_version,
    accepted_at,
    updated_at
  )
  values (
    v_user_id,
    p_terms_version,
    p_privacy_version,
    p_ai_notice_version,
    now(),
    now()
  )
  on conflict (user_id) do update
    set terms_version = excluded.terms_version,
        privacy_version = excluded.privacy_version,
        ai_notice_version = excluded.ai_notice_version,
        accepted_at = excluded.accepted_at,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.accept_required_legal_documents(text, text, text) from public;
grant execute on function public.accept_required_legal_documents(text, text, text) to authenticated;

create or replace function public.apply_promo_code_to_subscription(
  p_org_id uuid,
  p_code text,
  p_base_amount_cents integer default null
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

  v_base_amount_cents := coalesce(p_base_amount_cents, v_code.annual_price_cents);
  if v_base_amount_cents is null or v_base_amount_cents <= 0 then
    raise exception 'Informe o valor anual cheio para calcular o desconto.';
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

revoke all on function public.apply_promo_code_to_subscription(uuid, text, integer) from public;
grant execute on function public.apply_promo_code_to_subscription(uuid, text, integer) to authenticated;
