alter table public.statement_imports
  add column if not exists content_hash text;

alter table public.statement_items
  add column if not exists line_hash text,
  add column if not exists installment_number integer,
  add column if not exists total_installments integer;

alter table public.statement_items
  drop constraint if exists statement_items_status_check;

alter table public.statement_items
  add constraint statement_items_status_check
  check (status in ('pending', 'matched', 'accepted', 'review', 'ignored'));

alter table public.transactions
  add column if not exists recurring_bill_occurrence_id uuid
    references public.recurring_bill_occurrences(id) on delete set null;

update public.transactions t
set recurring_bill_occurrence_id = o.id
from public.recurring_bill_occurrences o
where o.paid_transaction_id = t.id
  and t.recurring_bill_occurrence_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'statement_items_org_line_hash_key'
  ) then
    alter table public.statement_items
      add constraint statement_items_org_line_hash_key unique (organization_id, line_hash);
  end if;
end $$;

create index if not exists statement_imports_org_content_hash_idx
  on public.statement_imports(organization_id, content_hash)
  where content_hash is not null;

create index if not exists transactions_recurring_bill_occurrence_idx
  on public.transactions(recurring_bill_occurrence_id)
  where recurring_bill_occurrence_id is not null;

-- Não removemos duplicatas financeiras automaticamente. Se a lógica antiga
-- já criou mais de uma linha para a mesma parcela do mesmo plano, abortamos
-- com diagnóstico para correção manual antes de impor a unicidade.
do $$
declare
  duplicate_groups text;
begin
  select string_agg(
    format(
      'org=%s plan=%s parcela=%s qtd=%s',
      organization_id,
      installment_plan_id,
      installment_number,
      duplicate_count
    ),
    '; '
  )
  into duplicate_groups
  from (
    select
      organization_id,
      installment_plan_id,
      installment_number,
      count(*) as duplicate_count
    from public.transactions
    where installment_plan_id is not null
      and installment_number is not null
    group by organization_id, installment_plan_id, installment_number
    having count(*) > 1
    order by count(*) desc
    limit 10
  ) duplicates;

  if duplicate_groups is not null then
    raise exception
      'Duplicatas existentes impedem a constraint transactions_org_installment_plan_number_key. Corrija manualmente estes grupos antes de reaplicar: %',
      duplicate_groups;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_org_installment_plan_number_key'
  ) then
    alter table public.transactions
      add constraint transactions_org_installment_plan_number_key
      unique (organization_id, installment_plan_id, installment_number);
  end if;
end $$;
