alter table public.organization_members
  add column if not exists is_primary boolean not null default false;

with ranked_memberships as (
  select
    id,
    row_number() over (partition by user_id order by created_at asc, id asc) as membership_rank
  from public.organization_members
)
update public.organization_members om
set is_primary = ranked_memberships.membership_rank = 1
from ranked_memberships
where ranked_memberships.id = om.id;

create unique index if not exists organization_members_one_primary_per_user
  on public.organization_members (user_id)
  where is_primary;

create or replace function public.set_primary_organization(p_org_id uuid)
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

  if not exists (
    select 1
    from public.organization_members
    where organization_id = p_org_id
      and user_id = v_user_id
  ) then
    raise exception 'Workspace nao encontrado para este usuario.';
  end if;

  update public.organization_members
  set is_primary = false
  where user_id = v_user_id
    and is_primary;

  update public.organization_members
  set is_primary = true
  where organization_id = p_org_id
    and user_id = v_user_id;
end;
$$;

revoke all on function public.set_primary_organization(uuid) from public;
grant execute on function public.set_primary_organization(uuid) to authenticated;

create or replace function public.ensure_primary_membership_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.is_primary and not exists (
    select 1
    from public.organization_members
    where user_id = new.user_id
      and is_primary
  ) then
    new.is_primary := true;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_ensure_primary_membership_default'
      and tgrelid = 'public.organization_members'::regclass
  ) then
    create trigger trg_ensure_primary_membership_default
      before insert on public.organization_members
      for each row execute function public.ensure_primary_membership_default();
  end if;
end;
$$;

create or replace function public.add_owner_as_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_members (organization_id, user_id, role, is_primary)
  values (
    new.id,
    new.owner_id,
    'admin',
    not exists (
      select 1
      from public.organization_members
      where user_id = new.owner_id
        and is_primary
    )
  );
  return new;
end;
$$;
