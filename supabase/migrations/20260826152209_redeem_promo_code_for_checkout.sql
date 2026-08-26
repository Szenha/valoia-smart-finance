-- apply_promo_code_to_subscription exige auth.uid() (usuário logado) e
-- checa is_org_admin() — certo quando era chamada direto pelo navegador
-- do cliente. Agora quem chama é createAsaasCheckoutFn, no servidor, via
-- chave de serviço — não existe "usuário logado" nesse contexto, então a
-- checagem sempre falhava com "Nao autenticado.", quebrando qualquer
-- checkout com cupom.
--
-- Esta função nova faz a mesma coisa (valida o cupom, calcula o desconto,
-- grava na assinatura, consome o uso) mas sem depender de sessão — por
-- isso não é liberada pra "authenticated": só quem tem a chave de serviço
-- (que ignora grants) consegue chamar.
create or replace function public.redeem_promo_code_for_checkout(
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
  v_code public.promo_codes%rowtype;
  v_base_amount_cents integer;
  v_discount_amount_cents integer;
  v_final_amount_cents integer;
begin
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

-- Sem grant para "authenticated" de propósito — só a service_role (usada
-- por createAsaasCheckoutFn no servidor) pode chamar; service_role ignora
-- grants e tem acesso de qualquer forma.
revoke all on function public.redeem_promo_code_for_checkout(uuid, text, text) from public;
