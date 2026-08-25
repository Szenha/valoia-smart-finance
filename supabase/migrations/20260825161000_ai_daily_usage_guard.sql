-- Daily AI usage guard for trial/beta cost control.

create or replace function public.consume_ai_daily_allowance(
  p_org_id uuid,
  p_operation text,
  p_daily_limit integer default 10
)
returns table (
  allowed boolean,
  used_count integer,
  daily_limit integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_used integer;
begin
  if v_user_id is null then
    raise exception 'Nao autenticado.';
  end if;

  if not public.is_org_member(p_org_id) then
    raise exception 'Sem permissao para usar IA neste workspace.';
  end if;

  select count(*)::integer
    into v_used
  from public.ai_usage_logs
  where organization_id = p_org_id
    and created_by = v_user_id
    and operation in ('voice_ai_guard', 'text_ai_guard')
    and created_at >= date_trunc('day', now())
    and created_at < date_trunc('day', now()) + interval '1 day';

  if v_used >= p_daily_limit then
    return query select false, v_used, p_daily_limit;
    return;
  end if;

  insert into public.ai_usage_logs (
    organization_id,
    provider,
    operation,
    model,
    metadata,
    created_by
  )
  values (
    p_org_id,
    'openai',
    case when p_operation = 'voice' then 'voice_ai_guard' else 'text_ai_guard' end,
    'usage_guard',
    jsonb_build_object('source', p_operation, 'daily_limit', p_daily_limit),
    v_user_id
  );

  return query select true, v_used + 1, p_daily_limit;
end;
$$;

revoke all on function public.consume_ai_daily_allowance(uuid, text, integer) from public;
grant execute on function public.consume_ai_daily_allowance(uuid, text, integer) to authenticated;

create index if not exists idx_ai_usage_logs_daily_guard
  on public.ai_usage_logs(organization_id, created_by, operation, created_at desc)
  where operation in ('voice_ai_guard', 'text_ai_guard');
