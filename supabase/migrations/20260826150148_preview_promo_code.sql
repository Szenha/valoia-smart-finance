-- apply_promo_code_to_subscription grava o desconto na assinatura assim
-- que o cliente clica "Aplicar" no diálogo — mesmo sem nunca chegar ao
-- checkout. Resultado: sair da tela e voltar (ou nem tentar pagar) deixa
-- o preço com desconto "grudado" pra sempre, sem o cliente ter digitado o
-- cupom de novo. A partir de agora:
--   - preview_promo_code_to_subscription: só calcula e mostra o valor
--     (sem gravar nada) — é o que o botão "Aplicar" do diálogo chama.
--   - apply_promo_code_to_subscription: continua fazendo a gravação real
--     e consumindo o uso do cupom, mas passa a ser chamada só no momento
--     de criar o checkout de verdade (createAsaasCheckoutFn), não mais
--     direto pelo cliente.
create or replace function public.preview_promo_code_to_subscription(
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
  if auth.uid() is null then
    raise exception 'Nao autenticado.';
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

  return query select
    v_code.code,
    v_code.discount_percent,
    v_base_amount_cents,
    v_discount_amount_cents,
    v_final_amount_cents;
end;
$$;

revoke all on function public.preview_promo_code_to_subscription(text, text) from public;
grant execute on function public.preview_promo_code_to_subscription(text, text) to authenticated;
