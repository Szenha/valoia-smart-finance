-- Observabilidade minima para custos de IA, incluindo transcricao de voz.

create table if not exists ai_usage_logs (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai')),
  operation text not null,
  model text not null,
  duration_seconds numeric(10,3),
  estimated_cost_usd numeric(12,6),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table ai_usage_logs enable row level security;

create policy "ai_usage_logs_select" on ai_usage_logs for select
  using (public.is_org_member(organization_id));
create policy "ai_usage_logs_insert" on ai_usage_logs for insert
  with check (public.is_org_contributor(organization_id));
create policy "ai_usage_logs_delete" on ai_usage_logs for delete
  using (public.is_org_admin(organization_id));

create index if not exists idx_ai_usage_logs_org_created
  on ai_usage_logs(organization_id, created_at desc);
