-- Metas e objetivos financeiros: 4 tipos (limite de gastos, sobra do
-- período, investimento, objetivo de longo prazo). Sem goal_links — cada
-- meta já tem no máximo uma conta e uma categoria relacionadas, o que cobre
-- os casos de uso pedidos sem precisar de uma tabela N:N extra.
create type goal_type as enum ('spending_limit', 'savings_result', 'investment', 'long_term');
create type goal_period as enum ('monthly', 'yearly', 'once');
create type goal_status as enum ('active', 'paused', 'closed');

create table financial_goals (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  goal_type goal_type not null,
  name text not null,
  description text,
  status goal_status not null default 'active',
  period_type goal_period not null default 'monthly',
  target_amount numeric(15,2) not null check (target_amount >= 0),
  initial_amount numeric(15,2),
  current_amount numeric(15,2),
  monthly_contribution numeric(15,2),
  estimated_return_rate numeric(6,3),
  start_date date not null default current_date,
  end_date date,
  account_id text,
  category_id uuid references categories(id) on delete set null,
  auto_tracked boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived boolean not null default false
);

create index idx_financial_goals_org on financial_goals(organization_id) where archived = false;

-- Meta sem nenhuma linha aqui = compartilhada com toda a família (household-wide).
-- Uma ou mais linhas = restrita a esses membros.
create table goal_members (
  id uuid primary key default uuid_generate_v4(),
  goal_id uuid not null references financial_goals(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (goal_id, member_user_id)
);

-- Histórico de atualização manual (objetivos de longo prazo sem conta
-- vinculada, ou qualquer meta que precise de ajuste manual pontual).
create table goal_progress (
  id uuid primary key default uuid_generate_v4(),
  goal_id uuid not null references financial_goals(id) on delete cascade,
  recorded_at date not null default current_date,
  amount numeric(15,2) not null,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_goal_progress_goal on goal_progress(goal_id, recorded_at desc);

alter table financial_goals enable row level security;
create policy "financial_goals_select" on financial_goals for select using (public.is_org_member(organization_id));
create policy "financial_goals_insert" on financial_goals for insert with check (public.is_org_contributor(organization_id));
create policy "financial_goals_update" on financial_goals for update
  using (public.is_org_contributor(organization_id))
  with check (public.is_org_contributor(organization_id));
create policy "financial_goals_delete" on financial_goals for delete using (public.is_org_admin(organization_id));

alter table goal_members enable row level security;
create policy "goal_members_select" on goal_members for select using (
  exists (select 1 from financial_goals g where g.id = goal_id and public.is_org_member(g.organization_id))
);
create policy "goal_members_insert" on goal_members for insert with check (
  exists (
    select 1 from financial_goals g
    where g.id = goal_id
      and public.is_org_contributor(g.organization_id)
      and public.is_user_org_member(member_user_id, g.organization_id)
  )
);
create policy "goal_members_delete" on goal_members for delete using (
  exists (select 1 from financial_goals g where g.id = goal_id and public.is_org_contributor(g.organization_id))
);

alter table goal_progress enable row level security;
create policy "goal_progress_select" on goal_progress for select using (
  exists (select 1 from financial_goals g where g.id = goal_id and public.is_org_member(g.organization_id))
);
create policy "goal_progress_insert" on goal_progress for insert with check (
  exists (select 1 from financial_goals g where g.id = goal_id and public.is_org_contributor(g.organization_id))
);
create policy "goal_progress_delete" on goal_progress for delete using (
  exists (select 1 from financial_goals g where g.id = goal_id and public.is_org_contributor(g.organization_id))
);

grant select, insert, update, delete on financial_goals, goal_members, goal_progress to authenticated;

-- Realizado automático para os 3 tipos baseados em transações (limite de
-- gastos, sobra do período, investimento). Objetivo de longo prazo não é
-- baseado em período/transações — é acompanhado no client via saldo de
-- conta vinculada ou o registro mais recente em goal_progress.
create or replace function public.goals_realized(p_org_id uuid, p_reference_date date default current_date)
returns table(goal_id uuid, period_start date, period_end date, realized_amount numeric)
language sql stable security invoker
set search_path = public
as $$
  with bounds as (
    select
      g.id as goal_id,
      case g.period_type
        when 'monthly' then date_trunc('month', p_reference_date)::date
        when 'yearly' then date_trunc('year', p_reference_date)::date
        else g.start_date
      end as period_start,
      case g.period_type
        when 'monthly' then (date_trunc('month', p_reference_date) + interval '1 month' - interval '1 day')::date
        when 'yearly' then (date_trunc('year', p_reference_date) + interval '1 year' - interval '1 day')::date
        else coalesce(g.end_date, p_reference_date)
      end as period_end,
      g.goal_type, g.account_id, g.category_id
    from financial_goals g
    where g.organization_id = p_org_id
      and g.archived = false
      and g.goal_type in ('spending_limit', 'investment', 'savings_result')
  )
  select
    b.goal_id, b.period_start, b.period_end,
    coalesce((
      select
        case b.goal_type
          when 'savings_result' then
            sum(case when t.amount > 0 then t.amount else 0 end)
              - sum(case when t.amount < 0 then abs(t.amount) else 0 end)
          else sum(abs(t.amount))
        end
      from transactions t
      where t.organization_id = p_org_id
        and t.posted_at::date between b.period_start and b.period_end
        and (b.account_id is null or t.account_id = b.account_id)
        and (b.category_id is null or t.category_id = b.category_id)
        and (b.goal_type <> 'spending_limit' or t.amount < 0)
        and (
          not exists (select 1 from goal_members gm where gm.goal_id = b.goal_id)
          or exists (
            select 1 from goal_members gm
            where gm.goal_id = b.goal_id
              and gm.member_user_id in (t.created_by, t.spent_by_member_id)
          )
        )
    ), 0) as realized_amount
  from bounds b;
$$;

grant execute on function public.goals_realized(uuid, date) to authenticated;
