-- Rateio de despesas: fechamentos salvos (simulação fica só no client, sem
-- gravar nada até o usuário clicar "Salvar rateio"). transaction_ids como
-- array nativo na própria tabela — sem tabela de junção, mesma simplificação
-- já usada em financial_goals (account_id/category_id direto em vez de
-- goal_links).
create table expense_splits (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text,
  period_start date not null,
  period_end date not null,
  filters jsonb not null default '{}'::jsonb,
  split_mode text not null check (split_mode in ('percentage', 'weight')),
  transaction_ids uuid[] not null default '{}',
  total_amount numeric(15,2) not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_expense_splits_org on expense_splits(organization_id, created_at desc);

create table expense_split_members (
  id uuid primary key default uuid_generate_v4(),
  split_id uuid not null references expense_splits(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  share numeric(8,3) not null,
  should_pay_amount numeric(15,2) not null,
  paid_amount numeric(15,2) not null,
  balance_amount numeric(15,2) not null
);

create index idx_expense_split_members_split on expense_split_members(split_id);

create table expense_split_settlements (
  id uuid primary key default uuid_generate_v4(),
  split_id uuid not null references expense_splits(id) on delete cascade,
  from_member_user_id uuid not null references auth.users(id),
  to_member_user_id uuid not null references auth.users(id),
  amount numeric(15,2) not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz
);

create index idx_expense_split_settlements_split on expense_split_settlements(split_id);

alter table expense_splits enable row level security;
create policy "expense_splits_select" on expense_splits for select using (public.is_org_member(organization_id));
create policy "expense_splits_insert" on expense_splits for insert with check (public.is_org_contributor(organization_id));
create policy "expense_splits_delete" on expense_splits for delete using (public.is_org_admin(organization_id));

alter table expense_split_members enable row level security;
create policy "expense_split_members_select" on expense_split_members for select using (
  exists (select 1 from expense_splits s where s.id = split_id and public.is_org_member(s.organization_id))
);
create policy "expense_split_members_insert" on expense_split_members for insert with check (
  exists (
    select 1 from expense_splits s
    where s.id = split_id
      and public.is_org_contributor(s.organization_id)
      and public.is_user_org_member(member_user_id, s.organization_id)
  )
);

alter table expense_split_settlements enable row level security;
create policy "expense_split_settlements_select" on expense_split_settlements for select using (
  exists (select 1 from expense_splits s where s.id = split_id and public.is_org_member(s.organization_id))
);
create policy "expense_split_settlements_insert" on expense_split_settlements for insert with check (
  exists (select 1 from expense_splits s where s.id = split_id and public.is_org_contributor(s.organization_id))
);
create policy "expense_split_settlements_update" on expense_split_settlements for update
  using (exists (select 1 from expense_splits s where s.id = split_id and public.is_org_contributor(s.organization_id)))
  with check (exists (select 1 from expense_splits s where s.id = split_id and public.is_org_contributor(s.organization_id)));

grant select, insert, delete on expense_splits to authenticated;
grant select, insert on expense_split_members to authenticated;
grant select, insert, update on expense_split_settlements to authenticated;
