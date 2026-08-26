-- 1) apply_promo_code_to_subscription não deve mais mudar status/plan_name
--    ao aplicar um cupom. Isso é herdado de um fluxo manual anterior à
--    integração automática com a Asaas: hoje faz o dialog de assinatura
--    "sumir" (vira awaiting_pix_confirmation antes de existir qualquer
--    checkout) e mostra pro app inteiro um aviso de pagamento pendente que
--    não existe ainda. O status só deve virar active_paid quando o webhook
--    confirmar um pagamento de verdade.
create or replace function public.apply_promo_code_to_subscription(
  p_org_id uuid,
  p_code text,
  p_billing_cycle text
)
returns table (
  code text,
  discount_percent numeric,
  base_amount_cents integer,
  discount_amount_cents integer,
  final_amount_cents integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code public.promo_codes%rowtype;
  v_base_amount_cents integer;
  v_discount_amount_cents integer;
  v_final_amount_cents integer;
begin
  if v_user_id is null then
    raise exception 'Nao autenticado.';
  end if;

  if not public.is_org_admin(p_org_id) then
    raise exception 'Sem permissao para aplicar codigo neste workspace.';
  end if;

  if p_billing_cycle not in ('monthly', 'annual') then
    raise exception 'Ciclo de cobranca invalido.';
  end if;

  select *
    into v_code
  from public.promo_codes pc
  where pc.code = upper(trim(p_code))
    and pc.active
    and (pc.valid_until is null or pc.valid_until >= now())
    and (pc.max_redemptions is null or pc.redemption_count < pc.max_redemptions)
  limit 1;

  if not found then
    raise exception 'Codigo promocional invalido ou expirado.';
  end if;

  select cp.price_cents
    into v_base_amount_cents
  from public.commercial_pricing cp
  where cp.billing_cycle = p_billing_cycle
    and cp.active;

  if v_base_amount_cents is null then
    raise exception 'Preco de tabela indisponivel para este ciclo.';
  end if;

  v_discount_amount_cents := round(v_base_amount_cents * (v_code.discount_percent / 100.0));
  v_final_amount_cents := greatest(v_base_amount_cents - v_discount_amount_cents, 0);

  -- Só registra o desconto calculado; status/plan_name continuam intocados
  -- até o pagamento ser confirmado de verdade pelo webhook.
  update public.commercial_subscriptions
    set promo_code_id = v_code.id,
        promo_code = v_code.code,
        discount_percent = v_code.discount_percent,
        base_amount_cents = v_base_amount_cents,
        discount_amount_cents = v_discount_amount_cents,
        amount_cents = v_final_amount_cents,
        updated_at = now()
  where organization_id = p_org_id;

  update public.promo_codes
    set redemption_count = redemption_count + 1,
        updated_at = now()
  where id = v_code.id;

  return query select
    v_code.code,
    v_code.discount_percent,
    v_base_amount_cents,
    v_discount_amount_cents,
    v_final_amount_cents;
end;
$$;

-- 2) Trava real (não só visual) para novos lançamentos quando o acesso
--    pago não está em dia. Escopo deliberadamente estreito: só INSERT em
--    transactions, que é o que "modo leitura" promete impedir. Reaproveita
--    a mesma lógica de vencimento de commercial_subscriptions.effectiveStatus()
--    (TypeScript) espelhada aqui em SQL.
create or replace function public.org_can_write(p_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select
        case
          when cs.status = 'trial_active' and cs.trial_ends_at < now() then false
          when cs.status = 'active_paid' and cs.paid_until is not null and cs.paid_until < now() then false
          when cs.status in ('trial_expired', 'payment_overdue', 'blocked_readonly', 'cancelled') then false
          else true
        end
      from public.commercial_subscriptions cs
      where cs.organization_id = p_org_id
    ),
    true
  );
$$;

create or replace function public.enforce_org_can_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.org_can_write(new.organization_id) then
    raise exception 'Assinatura vencida ou cancelada — este workspace está em modo leitura. Renove em "Meu plano" para continuar lançando.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_write_transactions on public.transactions;
create trigger trg_enforce_write_transactions
  before insert on public.transactions
  for each row execute function public.enforce_org_can_write();
