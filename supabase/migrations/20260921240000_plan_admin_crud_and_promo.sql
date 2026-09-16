-- Admin passa a poder criar planos de verdade (qualquer código, não só os
-- 6 fixos) e rodar promoções temporárias sobre planos existentes.

-- Solta a lista fixa de códigos — só valida formato de slug.
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_code_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_code_check
    CHECK (code ~ '^[a-z0-9_]{2,40}$');

-- Promoção temporária: preço alternativo válido só numa janela de tempo.
-- Não mexe em price (esse continua sendo o valor "de verdade", propagado
-- pra quem já assina via update-price) — promo_price vale só pra quem
-- COMPRAR durante a janela. Fora da janela, ignorado.
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS promo_price NUMERIC(10,2);
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS promo_starts_at TIMESTAMPTZ;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS promo_ends_at TIMESTAMPTZ;
ALTER TABLE public.plans ADD CONSTRAINT plans_promo_window_check
    CHECK (promo_starts_at IS NULL OR promo_ends_at IS NULL OR promo_ends_at > promo_starts_at);
