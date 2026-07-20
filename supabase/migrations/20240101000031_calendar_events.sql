-- Calendário família: compromissos das pessoas (ex: "Jazz Bia toda terça
-- 15h", "Futebol Samuel quinta 20h"), com ícone e cor (por padrão a do
-- membro, com override opcional). Sem tabela de exceções — recorrência
-- semanal é uma série simples (editar/excluir sempre afeta a série toda);
-- eventos avulsos são uma data única. As ocorrências não são
-- materializadas (diferente de recurring_bill_occurrences): são calculadas
-- na leitura por calendar_events_upcoming, já que não há estado por
-- ocorrência (pago/pulado) para persistir.

create table calendar_events (
  id                 uuid          primary key default uuid_generate_v4(),
  organization_id    uuid          not null references organizations(id) on delete cascade,
  member_user_id     uuid          references auth.users(id) on delete set null,
  title              text          not null,
  icon               text,
  color              text,
  notes              text,
  recurrence         text          not null check (recurrence in ('once', 'weekly')),
  event_date         date,
  weekday            smallint      check (weekday between 0 and 6),
  start_time         time,
  end_time           time,
  series_start_date  date          not null default current_date,
  series_end_date    date,
  created_by         uuid          references auth.users(id),
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now(),
  constraint calendar_events_once_has_date
    check (recurrence <> 'once' or event_date is not null),
  constraint calendar_events_weekly_has_weekday
    check (recurrence <> 'weekly' or weekday is not null)
);

alter table calendar_events enable row level security;

create policy "calendar_events_select" on calendar_events for select
  using (public.is_org_member(organization_id));
create policy "calendar_events_insert" on calendar_events for insert
  with check (public.is_org_contributor(organization_id));
create policy "calendar_events_update" on calendar_events for update
  using (public.is_org_contributor(organization_id));
create policy "calendar_events_delete" on calendar_events for delete
  using (public.is_org_admin(organization_id));

create index idx_calendar_events_org on calendar_events(organization_id);

-- Expande eventos 'once' e 'weekly' em ocorrências concretas dentro de
-- [p_start, p_end] — mesmo formato de uso de recurring_bills_upcoming, mas
-- calculado na hora já que não há ocorrência persistida.
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
  member_user_id uuid,
  start_time time,
  end_time time
)
language sql stable security invoker
set search_path = public
as $$
  select e.id, e.event_date, e.title, e.icon, e.color, e.member_user_id, e.start_time, e.end_time
  from calendar_events e
  where e.organization_id = p_org_id
    and e.recurrence = 'once'
    and e.event_date between p_start and p_end

  union all

  select e.id, d.occurrence_date, e.title, e.icon, e.color, e.member_user_id, e.start_time, e.end_time
  from calendar_events e
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
grant select, insert, update, delete on calendar_events to authenticated;
