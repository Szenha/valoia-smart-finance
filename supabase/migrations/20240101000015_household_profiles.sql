-- Household ownership, part 1: a public.profiles table so household
-- members can be shown by name/email instead of raw auth.users UUIDs
-- (which the client cannot query directly).

create table public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  email        text        not null,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create index idx_profiles_email on public.profiles (lower(email));

-- Does auth.uid() share ANY organization with target_user_id?
create or replace function public.shares_organization_with(target_user_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1
    from organization_members om1
    join organization_members om2 on om1.organization_id = om2.organization_id
    where om1.user_id = auth.uid() and om2.user_id = target_user_id
  );
$$;

create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or public.shares_organization_with(id));

create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- No insert/delete policy for clients: rows are created only by the
-- trigger below (SECURITY DEFINER bypasses RLS) and cascade on user delete.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- Backfill existing users
insert into public.profiles (id, email, display_name)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

grant execute on function public.shares_organization_with(uuid) to authenticated;
