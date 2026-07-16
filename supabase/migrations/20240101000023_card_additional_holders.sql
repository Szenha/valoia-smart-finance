-- Cartões adicionais: identidades de seleção vinculadas a um cartão de
-- crédito já existente, atribuídas a outro membro da família. Transações
-- feitas com um adicional gravam o mesmo account_id (account_key) do cartão
-- principal — por isso card_summary/account_balances/period_closures não
-- precisam de nenhuma mudança, o limite já é somado junto automaticamente.
create table card_additional_holders (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  financial_account_id uuid not null references financial_accounts(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (financial_account_id, member_user_id)
);

create index idx_card_additional_holders_account on card_additional_holders(financial_account_id);

-- só cartão de crédito pode ter adicional
create or replace function public.enforce_additional_holder_is_credit_card()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from financial_accounts
    where id = new.financial_account_id and kind = 'credit_card'
  ) then
    raise exception 'Cartão adicional só pode ser vinculado a um cartão de crédito.';
  end if;
  return new;
end;
$$;

create trigger card_additional_holder_must_be_credit_card
  before insert or update on card_additional_holders
  for each row execute function public.enforce_additional_holder_is_credit_card();

alter table card_additional_holders enable row level security;

create policy "card_additional_holders_select" on card_additional_holders
  for select using (public.is_org_member(organization_id));
create policy "card_additional_holders_insert" on card_additional_holders
  for insert with check (
    public.is_org_contributor(organization_id)
    and public.is_user_org_member(member_user_id, organization_id)
  );
create policy "card_additional_holders_update" on card_additional_holders
  for update using (public.is_org_contributor(organization_id))
  with check (
    public.is_org_contributor(organization_id)
    and public.is_user_org_member(member_user_id, organization_id)
  );
create policy "card_additional_holders_delete" on card_additional_holders
  for delete using (public.is_org_admin(organization_id));

grant select, insert, update, delete on card_additional_holders to authenticated;

-- "de quem é o gasto" — separado de created_by ("quem lançou", que continua
-- controlando permissão de editar/excluir via as policies já existentes).
alter table transactions add column if not exists spent_by_member_id uuid references auth.users(id) on delete set null;
create index if not exists idx_transactions_spent_by on transactions(spent_by_member_id) where spent_by_member_id is not null;
