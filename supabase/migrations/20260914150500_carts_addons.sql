-- Mesma ideia do order_items.addons: guarda os adicionais escolhidos junto
-- da linha do carrinho persistido, pra sobreviver a troca de dispositivo.
ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS addons JSONB;
