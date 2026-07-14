-- Household ownership, part 2: titularidade de conta/cartão, validation
-- that transactions/installment plans reference a real instrument of the
-- household, the "installments only on credit card" business rule, and a
-- minimal admin-only "add member by email" mechanism.

-- ── ownership column ────────────────────────────────────────────────────
alter table financial_accounts
  add column owner_user_id uuid references auth.users(id) on delete restrict;

update financial_accounts fa
set owner_user_id = o.owner_id
from organizations o
where fa.organization_id = o.id and fa.owner_user_id is null;

alter table financial_accounts alter column owner_user_id set not null;

create index idx_financial_accounts_owner
  on financial_accounts(organization_id, owner_user_id);

-- Default owner to the acting user when the caller omits it, so existing
-- upsert call sites (OFX/PDF import auto-creating accounts) keep working.
create or replace function public.default_financial_account_owner()
returns trigger language plpgsql security definer as $$
begin
  if new.owner_user_id is null then
    new.owner_user_id := auth.uid();
  end if;
  return new;
end;
$$;

create trigger trg_default_financial_account_owner
  before insert on financial_accounts
  for each row execute function public.default_financial_account_owner();

create or replace function public.is_user_org_member(p_user_id uuid, p_org_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from organization_members
    where organization_id = p_org_id and user_id = p_user_id
  );
$$;

grant execute on function public.is_user_org_member(uuid, uuid) to authenticated;

drop policy "financial_accounts_insert" on financial_accounts;
create policy "financial_accounts_insert" on financial_accounts for insert
  with check (
    public.is_org_contributor(organization_id)
    and public.is_user_org_member(owner_user_id, organization_id)
  );

drop policy "financial_accounts_update" on financial_accounts;
create policy "financial_accounts_update" on financial_accounts for update
  using (public.is_org_contributor(organization_id))
  with check (
    public.is_org_contributor(organization_id)
    and public.is_user_org_member(owner_user_id, organization_id)
  );

-- ── close the account_id free-text validation gap ───────────────────────
-- transactions.account_id / installment_plans.account_id are free-text
-- keys matching financial_accounts.account_key, not a real FK. Nothing
-- today verifies they resolve to an actual instrument of the org.
create or replace function public.account_belongs_to_org(p_account_key text, p_org_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from financial_accounts
    where organization_id = p_org_id and account_key = p_account_key
  );
$$;

grant execute on function public.account_belongs_to_org(text, uuid) to authenticated;

drop policy "transactions_insert" on transactions;
create policy "transactions_insert" on transactions for insert
  with check (
    public.is_org_contributor(organization_id)
    and public.account_belongs_to_org(account_id, organization_id)
  );

drop policy "transactions_update" on transactions;
create policy "transactions_update" on transactions for update
  using (public.is_org_contributor(organization_id))
  with check (
    public.is_org_contributor(organization_id)
    and public.account_belongs_to_org(account_id, organization_id)
  );

drop policy "plans_insert" on installment_plans;
create policy "plans_insert" on installment_plans for insert
  with check (
    public.is_org_contributor(organization_id)
    and public.account_belongs_to_org(account_id, organization_id)
  );

drop policy "plans_update" on installment_plans;
create policy "plans_update" on installment_plans for update
  using (public.is_org_contributor(organization_id))
  with check (
    public.is_org_contributor(organization_id)
    and public.account_belongs_to_org(account_id, organization_id)
  );

-- ── installments only ever apply to credit_card ──────────────────────────
alter table transactions
  add constraint chk_installment_requires_credit_card
  check (installment_plan_id is null or account_kind = 'credit_card');

-- ── add existing user to household by email (admin-only) ────────────────
create or replace function public.find_household_candidate(p_org_id uuid, p_email text)
returns table(user_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_org_admin(p_org_id) then
    return; -- empty result set, same shape as "no such email"
  end if;

  return query
    select p.id, p.display_name
    from public.profiles p
    where p.email = lower(trim(p_email))
    limit 1;
end;
$$;

grant execute on function public.find_household_candidate(uuid, text) to authenticated;

-- ── joining a household must actually change "current org" ──────────────
-- Was: oldest membership wins, which meant a second membership (joining a
-- household) had no visible effect. No-op for the common case of a single
-- membership; only changes behavior once a user belongs to 2+ orgs.
create or replace function public.ensure_user_organization()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id  uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  select om.organization_id into v_org_id
  from public.organization_members om
  where om.user_id = v_user_id
  order by om.created_at desc
  limit 1;

  if v_org_id is not null then
    return v_org_id;
  end if;

  insert into public.organizations (name, owner_id)
  values ('Minha Organização', v_user_id)
  returning id into v_org_id;

  return v_org_id;
end;
$$;
