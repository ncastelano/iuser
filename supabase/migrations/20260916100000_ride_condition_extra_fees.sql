-- supabase/migrations/20260916100000_ride_condition_extra_fees.sql
--
-- As condições do pedido (acesso em condomínio, compras no mercado,
-- necessidade especial, pet sem caixa de transporte, entrega em área
-- interna/apartamento) viravam só avisos informativos pro motorista, sem
-- pesar no preço. Agora cada uma vira uma cobrança extra configurável -
-- mesmo esquema já usado pros extras por tipo de corrida
-- (extra_fee_pessoa/animal/objeto): null = usa o valor padrão da
-- plataforma (resolvido em código, ver src/lib/driverPricing.ts).
--
-- Ar condicionado é condição nova - o passageiro escolhe ao pedir a
-- corrida, por isso o campo novo em ride_requests.

alter table public.ride_requests
    add column if not exists wants_air_conditioning boolean not null default false;

alter table public.driver_pricing
    add column if not exists extra_fee_condominio numeric,
    add column if not exists extra_fee_compras numeric,
    add column if not exists extra_fee_necessidade_especial numeric,
    add column if not exists extra_fee_pet_sem_caixa numeric,
    add column if not exists extra_fee_entrega_interna numeric,
    add column if not exists extra_fee_ar_condicionado numeric;
