-- Contas fixas recorrentes: obrigações com vencimento (escola, condomínio,
-- luz, seguro...) que compõem o orçamento mas precisam de calendário,
-- lembrete e "baixa" por competência — o que `budgets` (previsto x
-- realizado agregado por categoria/mês) não cobre.

create table recurring_bills (
  id                    uuid          primary key default uuid_generate_v4(),
  organization_id       uuid          not null references organizations(id) on delete cascade,
  name                  text          not null,
  category_id           uuid          references categories(id) on delete set null,
  account_id            text,
  expected_amount       numeric(15,2) not null check (expected_amount >= 0),
  amount_is_variable    boolean       not null default false,
  recurrence_frequency  text          not null default 'monthly'
    check (recurrence_frequency in ('monthly', 'yearly')),
  due_day               integer       not null check (due_day between 1 and 31),
  due_date_adjustment   text          not null default 'previous_business_day'
    check (due_date_adjustment in ('none', 'previous_business_day', 'next_business_day')),
  reminder_days_before  integer       not null default 3 check (reminder_days_before >= 0),
  status                text          not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  start_date            date          not null default current_date,
  end_date              date,
  notes                 text,
  created_by            uuid          references auth.users(id),
  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now()
);

alter table recurring_bills enable row level security;

create policy "recurring_bills_select" on recurring_bills for select
  using (public.is_org_member(organization_id));
create policy "recurring_bills_insert" on recurring_bills for insert
  with check (public.is_org_contributor(organization_id));
create policy "recurring_bills_update" on recurring_bills for update
  using (public.is_org_contributor(organization_id));
create policy "recurring_bills_delete" on recurring_bills for delete
  using (public.is_org_admin(organization_id));

create index idx_recurring_bills_org_status
  on recurring_bills(organization_id, status);

-- Uma linha por competência (mês ou ano, conforme recurrence_frequency).
-- É aqui que mora a "baixa": paid_transaction_id aponta para o lançamento
-- real quando existir, sem duplicar o registro em `transactions`.
create table recurring_bill_occurrences (
  id                  uuid          primary key default uuid_generate_v4(),
  recurring_bill_id   uuid          not null references recurring_bills(id) on delete cascade,
  organization_id     uuid          not null references organizations(id) on delete cascade,
  due_date            date          not null,
  expected_amount     numeric(15,2) not null,
  status              text          not null default 'pending'
    check (status in ('pending', 'paid', 'skipped')),
  paid_transaction_id uuid          references transactions(id) on delete set null,
  paid_amount         numeric(15,2),
  paid_at             timestamptz,
  paid_by             uuid          references auth.users(id),
  created_at          timestamptz   not null default now(),
  unique (recurring_bill_id, due_date)
);

-- Defesa em profundidade: organization_id sempre herdado da conta fixa
-- pai, nunca decidido pelo client — mesmo padrão de
-- enforce_category_type_inheritance (migration 20240101000021).
create or replace function public.set_bill_occurrence_org()
returns trigger
language plpgsql
as $$
begin
  select organization_id into new.organization_id
  from public.recurring_bills
  where id = new.recurring_bill_id;
  return new;
end;
$$;

create trigger bill_occurrence_org
  before insert on recurring_bill_occurrences
  for each row
  execute function public.set_bill_occurrence_org();

alter table recurring_bill_occurrences enable row level security;

create policy "recurring_bill_occurrences_select" on recurring_bill_occurrences for select
  using (public.is_org_member(organization_id));
create policy "recurring_bill_occurrences_insert" on recurring_bill_occurrences for insert
  with check (public.is_org_contributor(organization_id));
create policy "recurring_bill_occurrences_update" on recurring_bill_occurrences for update
  using (public.is_org_contributor(organization_id));
create policy "recurring_bill_occurrences_delete" on recurring_bill_occurrences for delete
  using (public.is_org_admin(organization_id));

create index idx_recurring_bill_occurrences_org_due
  on recurring_bill_occurrences(organization_id, due_date);
create index idx_recurring_bill_occurrences_bill
  on recurring_bill_occurrences(recurring_bill_id, due_date);

-- Empurra p_date para o dia útil mais próximo na direção pedida, quando cai
-- em sábado/domingo. Não considera feriados — não há calendário de
-- feriados no projeto; só ajusta fim de semana.
create or replace function public.adjust_to_business_day(p_date date, p_mode text)
returns date
language plpgsql
immutable
as $$
declare
  result date := p_date;
begin
  if p_mode = 'previous_business_day' then
    while extract(isodow from result) in (6, 7) loop
      result := result - 1;
    end loop;
  elsif p_mode = 'next_business_day' then
    while extract(isodow from result) in (6, 7) loop
      result := result + 1;
    end loop;
  end if;
  return result;
end;
$$;

-- Gera as ocorrências que faltam, até p_through, para todas as contas
-- fixas ativas da organização. Idempotente via unique(recurring_bill_id,
-- due_date) + on conflict do nothing — pode ser chamada a cada
-- carregamento de tela sem duplicar nada.
create or replace function public.ensure_recurring_bill_occurrences(
  p_org_id uuid,
  p_through date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Ancorado em start_date (não no mês corrente) para que contas anuais
  -- caiam sempre no mesmo mês do cadastro; o filtro por month_start >=
  -- mês corrente evita gerar/backfillar ocorrências antigas.
  insert into recurring_bill_occurrences (recurring_bill_id, organization_id, due_date, expected_amount)
  select
    b.id,
    b.organization_id,
    public.adjust_to_business_day(
      least(
        (months.month_start + (b.due_day - 1) * interval '1 day')::date,
        (months.month_start + interval '1 month - 1 day')::date
      ),
      b.due_date_adjustment
    ) as due_date,
    b.expected_amount
  from recurring_bills b
  cross join lateral (
    select generate_series(
      date_trunc('month', b.start_date)::date,
      date_trunc('month', p_through)::date,
      case b.recurrence_frequency when 'yearly' then interval '1 year' else interval '1 month' end
    )::date as month_start
  ) months
  where b.organization_id = p_org_id
    and b.status = 'active'
    and months.month_start >= date_trunc('month', now())::date
    and (b.end_date is null or months.month_start <= b.end_date)
  on conflict (recurring_bill_id, due_date) do nothing;
end;
$$;

grant execute on function public.adjust_to_business_day(date, text) to authenticated;
grant execute on function public.ensure_recurring_bill_occurrences(uuid, date) to authenticated;

-- Ocorrências no período, já com nome da conta fixa e caminho de
-- categoria (reaproveita category_full_path, migration 20240101000013) —
-- fonte única para o calendário em Planejamento e o card do Dashboard.
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
    b.account_id,
    o.due_date,
    o.expected_amount,
    o.status,
    o.paid_transaction_id,
    o.paid_amount,
    o.paid_at
  from recurring_bill_occurrences o
  join recurring_bills b on b.id = o.recurring_bill_id
  where o.organization_id = p_org_id
    and o.due_date between p_start and p_end
  order by o.due_date;
$$;

grant execute on function public.recurring_bills_upcoming(uuid, date, date) to authenticated;
grant select, insert, update, delete on recurring_bills to authenticated;
grant select, insert, update, delete on recurring_bill_occurrences to authenticated;
