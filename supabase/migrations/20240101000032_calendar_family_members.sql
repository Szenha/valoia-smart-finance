-- "Membro da família" pro Calendário não pode ficar restrito a quem tem
-- login no workspace (organization_members exige um auth.users) — uma
-- criança sem conta, por exemplo, precisa poder ter compromissos e cor
-- própria. family_members é um cadastro leve, só nome + cor, sem qualquer
-- vínculo com autenticação. Cor passa a ser atributo do membro (definida
-- uma vez), não mais um override por evento.

create table family_members (
  id               uuid          primary key default uuid_generate_v4(),
  organization_id  uuid          not null references organizations(id) on delete cascade,
  name             text          not null,
  color            text          not null,
  archived         boolean       not null default false,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now()
);

alter table family_members enable row level security;

create policy "family_members_select" on family_members for select
  using (public.is_org_member(organization_id));
create policy "family_members_insert" on family_members for insert
  with check (public.is_org_contributor(organization_id));
create policy "family_members_update" on family_members for update
  using (public.is_org_contributor(organization_id));
create policy "family_members_delete" on family_members for delete
  using (public.is_org_admin(organization_id));

create index idx_family_members_org on family_members(organization_id, archived);

-- Substitui member_user_id (auth.users) por family_member_id (family_members)
-- em calendar_events — a feature acabou de ser criada nesta mesma leva de
-- migrations, sem dados reais em produção ainda, então é seguro trocar a
-- coluna em vez de manter as duas.
alter table calendar_events
  drop column if exists member_user_id,
  drop column if exists color,
  add column family_member_id uuid references family_members(id) on delete set null;

-- Nome/tipo das colunas de retorno mudou (member_user_id -> family_member_id),
-- e create or replace não permite alterar OUT parameters — precisa dropar
-- a versão antiga primeiro.
drop function if exists public.calendar_events_upcoming(uuid, date, date);

create or replace function public.calendar_events_upcoming(
  p_org_id uuid,
  p_start date,
  p_end date
)
returns table(
  event_id uuid,
  occurrence_date date,
  title text,
  icon text,
  color text,
  family_member_id uuid,
  start_time time,
  end_time time
)
language sql stable security invoker
set search_path = public
as $$
  select e.id, e.event_date, e.title, e.icon, fm.color, e.family_member_id, e.start_time, e.end_time
  from calendar_events e
  left join family_members fm on fm.id = e.family_member_id
  where e.organization_id = p_org_id
    and e.recurrence = 'once'
    and e.event_date between p_start and p_end

  union all

  select e.id, d.occurrence_date, e.title, e.icon, fm.color, e.family_member_id, e.start_time, e.end_time
  from calendar_events e
  left join family_members fm on fm.id = e.family_member_id
  cross join lateral (
    select gs::date as occurrence_date
    from generate_series(
      greatest(p_start, e.series_start_date),
      least(p_end, coalesce(e.series_end_date, p_end)),
      interval '1 day'
    ) as gs
    where extract(dow from gs) = e.weekday
  ) d
  where e.organization_id = p_org_id
    and e.recurrence = 'weekly'
    and e.series_start_date <= p_end
    and (e.series_end_date is null or e.series_end_date >= p_start)

  order by 2;
$$;

grant execute on function public.calendar_events_upcoming(uuid, date, date) to authenticated;
grant select, insert, update, delete on family_members to authenticated;
