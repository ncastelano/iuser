-- A cobrança por tempo (valor por minuto) foi removida da tarifa da plataforma e da
-- "Minha tarifa": o preço volta a ser valor base + quilometragem + extras. Tira as
-- colunas que só existiam pra isso.
ALTER TABLE public.platform_tariffs DROP COLUMN IF EXISTS price_per_minute;
ALTER TABLE public.driver_pricing DROP COLUMN IF EXISTS price_per_minute;
