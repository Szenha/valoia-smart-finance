-- Confirmado direto na API da Asaas: um pagamento avulso (DETACHED, Pix
-- ou cartão) criado via checkout NÃO recebe o externalReference que
-- mandamos na criação — ele só existe no objeto do checkout, nunca é
-- copiado pro payment resultante. Sem isso, o webhook de confirmação não
-- tinha como saber a qual organização o pagamento pertencia (o pagamento
-- caía, mas nada no Ticlio mudava).
--
-- Em vez de depender do que a Asaas devolve, guardamos essa relação no
-- nosso próprio banco no momento em que criamos o checkout.
create table if not exists public.asaas_checkout_sessions (
  checkout_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual')),
  created_at timestamptz not null default now()
);

alter table public.asaas_checkout_sessions enable row level security;
-- Sem nenhuma policy de propósito: só a service_role (usada pelo servidor
-- em createAsaasCheckoutFn e no webhook) acessa essa tabela — service_role
-- ignora RLS, e nenhum cliente autenticado precisa ler isto.
