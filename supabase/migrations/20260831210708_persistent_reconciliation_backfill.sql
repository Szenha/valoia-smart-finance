-- Fase 1 complementar: backfill da base persistente a partir do modelo legado.
-- Não altera lançamentos financeiros nem apaga dados; apenas cria períodos,
-- linhas externas, links persistentes e diagnósticos quando há ambiguidade.

create table if not exists public.reconciliation_backfill_diagnostics (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  statement_item_id uuid references public.statement_items(id) on delete set null,
  issue text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, statement_item_id, issue)
);

alter table public.reconciliation_backfill_diagnostics enable row level security;

create policy "reconciliation_backfill_diagnostics_select"
  on public.reconciliation_backfill_diagnostics for select
  using (public.is_org_member(organization_id));

create policy "reconciliation_backfill_diagnostics_insert"
  on public.reconciliation_backfill_diagnostics for insert
  with check (public.is_org_contributor(organization_id));

grant select, insert on public.reconciliation_backfill_diagnostics to authenticated;

create or replace function pg_temp.ticlo_normalize_statement_description(value text)
returns text
language sql
immutable
as $$
  select lower(
    btrim(
      regexp_replace(
        translate(
          coalesce(value, ''),
          'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
        ),
        '\s+',
        ' ',
        'g'
      )
    )
  );
$$;

create or replace function pg_temp.ticlo_uint32(value numeric)
returns bigint
language sql
immutable
as $$
  select mod(mod(value, 4294967296) + 4294967296, 4294967296)::bigint;
$$;

create or replace function pg_temp.ticlo_urshift(value bigint, bits integer)
returns bigint
language sql
immutable
as $$
  select floor(pg_temp.ticlo_uint32(value)::numeric / power(2::numeric, bits))::bigint;
$$;

create or replace function pg_temp.ticlo_imul(left_value bigint, right_value bigint)
returns bigint
language sql
immutable
as $$
  select pg_temp.ticlo_uint32(left_value::numeric * right_value::numeric);
$$;

create or replace function pg_temp.ticlo_stable_hash(seed text)
returns text
language plpgsql
immutable
as $$
declare
  h1 bigint := 3735928559; -- 0xdeadbeef
  h2 bigint := 1103543895; -- 0x41c6ce57
  idx integer;
  ch integer;
begin
  for idx in 1..char_length(seed) loop
    ch := ascii(substr(seed, idx, 1));
    h1 := pg_temp.ticlo_imul(h1 # ch, 2654435761);
    h2 := pg_temp.ticlo_imul(h2 # ch, 1597334677);
  end loop;

  h1 := (
    pg_temp.ticlo_imul(h1 # pg_temp.ticlo_urshift(h1, 16), 2246822507)
    # pg_temp.ticlo_imul(h2 # pg_temp.ticlo_urshift(h2, 13), 3266489909)
  );
  h1 := pg_temp.ticlo_uint32(h1);

  h2 := (
    pg_temp.ticlo_imul(h2 # pg_temp.ticlo_urshift(h2, 16), 2246822507)
    # pg_temp.ticlo_imul(h1 # pg_temp.ticlo_urshift(h1, 13), 3266489909)
  );
  h2 := pg_temp.ticlo_uint32(h2);

  return lpad(to_hex(h2), 8, '0') || lpad(to_hex(h1), 8, '0');
end;
$$;

with legacy_items as (
  select
    si.id,
    si.organization_id,
    si.statement_import_id,
    imp.source::text as import_source,
    si.matched_transaction_id,
    si.line_hash,
    si.amount,
    si.description,
    si.posted_at,
    si.fit_id,
    si.type,
    si.account_id,
    si.account_kind,
    si.currency,
    si.status,
    si.match_confidence,
    si.installment_number,
    si.total_installments,
    imp.period_start,
    imp.period_end,
    coalesce(imp.period_start::date, min(si.posted_at::date) over (partition by si.statement_import_id)) as backfill_period_start,
    coalesce(imp.period_end::date, max(si.posted_at::date) over (partition by si.statement_import_id)) as backfill_period_end,
    case
      when imp.source::text like 'pdf%' then 'pdf_card_invoice'
      when si.account_kind = 'credit_card' then 'ofx_credit_card'
      else 'ofx_checking'
    end as source_type,
    case
      when imp.source::text like 'pdf%' or si.account_kind = 'credit_card' then 'card_invoice'
      else 'account_statement'
    end as scope_type,
    pg_temp.ticlo_normalize_statement_description(si.description) as normalized_description
  from public.statement_items si
  join public.statement_imports imp on imp.id = si.statement_import_id
),
periods as (
  insert into public.reconciliation_periods (
    organization_id,
    scope_type,
    account_id,
    account_kind,
    period_start,
    period_end,
    competence_period,
    expected_total,
    updated_at
  )
  select
    organization_id,
    scope_type,
    account_id,
    account_kind,
    backfill_period_start,
    backfill_period_end,
    date_trunc('month', backfill_period_start)::date,
    sum(amount),
    now()
  from legacy_items
  group by organization_id, scope_type, account_id, account_kind, backfill_period_start, backfill_period_end
  on conflict (organization_id, scope_type, account_id, account_kind, period_start, period_end)
  do update set
    expected_total = excluded.expected_total,
    updated_at = now()
  returning id, organization_id, scope_type, account_id, account_kind, period_start, period_end
),
prepared_external_items as (
  select
    li.*,
    p.id as reconciliation_period_id,
    pg_temp.ticlo_stable_hash(
      concat_ws(
        '|',
        'source',
        li.source_type,
        li.account_id,
        li.account_kind,
        li.posted_at::date::text,
        round(li.amount * 100)::bigint::text,
        li.normalized_description,
        coalesce(nullif(btrim(li.fit_id), ''), 'no-fitid'),
        coalesce(nullif(btrim(li.line_hash), ''), 'no-linehash'),
        coalesce(li.installment_number::text, 'no-installment'),
        coalesce(li.total_installments::text, 'no-total-installments')
      )
    ) as source_fingerprint,
    pg_temp.ticlo_stable_hash(
      concat_ws(
        '|',
        'reconciliation',
        li.account_id,
        li.account_kind,
        li.posted_at::date::text,
        round(li.amount * 100)::bigint::text,
        li.normalized_description,
        coalesce(li.installment_number::text, 'no-installment'),
        coalesce(li.total_installments::text, 'no-total-installments')
      )
    ) as reconciliation_fingerprint
  from legacy_items li
  join public.reconciliation_periods p
    on p.organization_id = li.organization_id
   and p.scope_type = li.scope_type
   and p.account_id = li.account_id
   and p.account_kind = li.account_kind
   and p.period_start = li.backfill_period_start
   and p.period_end = li.backfill_period_end
),
duplicate_external_fingerprints as (
  select organization_id, source_fingerprint, array_agg(id order by id) as statement_item_ids
  from prepared_external_items
  group by organization_id, source_fingerprint
  having count(*) > 1
),
external_diagnostics as (
  insert into public.reconciliation_backfill_diagnostics (
    organization_id,
    statement_item_id,
    issue,
    details
  )
  select
    pei.organization_id,
    pei.id,
    'duplicate_external_source_fingerprint',
    jsonb_build_object(
      'source_fingerprint', pei.source_fingerprint,
      'statement_item_ids', dup.statement_item_ids
    )
  from prepared_external_items pei
  join duplicate_external_fingerprints dup
    on dup.organization_id = pei.organization_id
   and dup.source_fingerprint = pei.source_fingerprint
  on conflict (organization_id, statement_item_id, issue) do nothing
),
inserted_external_items as (
  insert into public.external_statement_items (
    organization_id,
    reconciliation_period_id,
    statement_import_id,
    source_type,
    source_fingerprint,
    reconciliation_fingerprint,
    raw_description,
    normalized_description,
    amount,
    posted_at,
    account_id,
    account_kind,
    fit_id,
    line_hash,
    installment_number,
    total_installments,
    status,
    updated_at
  )
  select
    organization_id,
    reconciliation_period_id,
    statement_import_id,
    source_type,
    source_fingerprint,
    reconciliation_fingerprint,
    description,
    normalized_description,
    amount,
    posted_at,
    account_id,
    account_kind,
    fit_id,
    line_hash,
    installment_number,
    total_installments,
    status,
    now()
  from prepared_external_items
  where not exists (
    select 1
    from duplicate_external_fingerprints dup
    where dup.organization_id = prepared_external_items.organization_id
      and dup.source_fingerprint = prepared_external_items.source_fingerprint
  )
  on conflict (organization_id, source_fingerprint) do update set
    reconciliation_period_id = excluded.reconciliation_period_id,
    statement_import_id = coalesce(public.external_statement_items.statement_import_id, excluded.statement_import_id),
    source_type = excluded.source_type,
    reconciliation_fingerprint = excluded.reconciliation_fingerprint,
    raw_description = excluded.raw_description,
    normalized_description = excluded.normalized_description,
    amount = excluded.amount,
    posted_at = excluded.posted_at,
    account_id = excluded.account_id,
    account_kind = excluded.account_kind,
    fit_id = excluded.fit_id,
    line_hash = excluded.line_hash,
    installment_number = excluded.installment_number,
    total_installments = excluded.total_installments,
    status = excluded.status,
    updated_at = now()
),
link_candidates as (
  select organization_id, id as statement_item_id, matched_transaction_id as transaction_id
  from prepared_external_items
  where matched_transaction_id is not null

  union

  select si.organization_id, si.id as statement_item_id, t.id as transaction_id
  from public.statement_items si
  join public.transactions t
    on t.organization_id = si.organization_id
   and t.reconciled_statement_item_id = si.id
),
link_resolution as (
  select
    statement_item_id,
    count(distinct transaction_id) as transaction_count,
    min(transaction_id) as transaction_id,
    array_agg(distinct transaction_id order by transaction_id) as transaction_ids
  from link_candidates
  group by statement_item_id
),
link_diagnostics as (
  insert into public.reconciliation_backfill_diagnostics (
    organization_id,
    statement_item_id,
    issue,
    details
  )
  select
    pei.organization_id,
    pei.id,
    case
      when lr.transaction_count > 1 then 'ambiguous_legacy_transaction_link'
      else 'missing_legacy_transaction_link'
    end,
    jsonb_build_object(
      'statement_item_status', pei.status,
      'matched_transaction_id', pei.matched_transaction_id,
      'transaction_ids', coalesce(lr.transaction_ids, array[]::uuid[])
    )
  from prepared_external_items pei
  left join link_resolution lr on lr.statement_item_id = pei.id
  where (pei.status in ('matched', 'accepted') and coalesce(lr.transaction_count, 0) <> 1)
     or coalesce(lr.transaction_count, 0) > 1
  on conflict (organization_id, statement_item_id, issue) do nothing
)
insert into public.reconciliation_links (
  organization_id,
  external_statement_item_id,
  transaction_id,
  status,
  confidence,
  match_reason,
  matched_at,
  updated_at
)
select
  pei.organization_id,
  esi.id,
  case when lr.transaction_count = 1 then lr.transaction_id else null end,
  case
    when pei.status = 'accepted' then 'accepted_new'
    when pei.status = 'review' then 'review'
    when pei.status = 'ignored' then 'ignored'
    else 'matched'
  end,
  pei.match_confidence,
  'legacy_backfill',
  now(),
  now()
from prepared_external_items pei
join public.external_statement_items esi
  on esi.organization_id = pei.organization_id
 and esi.source_fingerprint = pei.source_fingerprint
left join link_resolution lr on lr.statement_item_id = pei.id
where pei.status in ('matched', 'accepted', 'review', 'ignored')
  and coalesce(lr.transaction_count, 0) <= 1
on conflict (organization_id, external_statement_item_id) do update set
  transaction_id = coalesce(public.reconciliation_links.transaction_id, excluded.transaction_id),
  status = excluded.status,
  confidence = coalesce(excluded.confidence, public.reconciliation_links.confidence),
  match_reason = coalesce(public.reconciliation_links.match_reason, excluded.match_reason),
  matched_at = coalesce(public.reconciliation_links.matched_at, excluded.matched_at),
  updated_at = now();
