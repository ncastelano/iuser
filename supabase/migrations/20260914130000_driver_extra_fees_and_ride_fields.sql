-- Motorista passa a poder definir um valor extra por tipo de corrida
-- (pessoa/animal/objeto), seguindo o mesmo esquema de "plataforma ou
-- próprio" que já existe pra tarifa base (pricing_mode). Fica opcional —
-- quando nulo, o valor padrão da plataforma (definido no código) é usado.
alter table public.driver_pricing
    add column if not exists extra_fee_pessoa numeric,
    add column if not exists extra_fee_animal numeric,
    add column if not exists extra_fee_objeto numeric;

-- Tamanho da compra de mercado (pequeno/médio/grande), no mesmo padrão já
-- usado pro tamanho do objeto extra em pedir-motorista.
alter table public.ride_requests
    add column if not exists grocery_bag_size text check (grocery_bag_size in ('pequeno', 'medio', 'grande'));

-- Quando o pagamento é em cartão, o motorista precisa saber se a máquina
-- dele precisa suportar aproximação (contactless) ou não.
alter table public.ride_requests
    add column if not exists card_is_contactless boolean;
