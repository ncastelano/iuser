-- Rollback de 20261130000043: volta os extras de animal (5) e objeto (3) das tarifas de moto e bicicleta (o carro já estava em 0) e remove o ganho mínimo padrão.
BEGIN;
UPDATE public.platform_tariffs SET extra_fee_animal = 5, extra_fee_objeto = 3, updated_at = now() WHERE vehicle_kind IN ('moto', 'bicicleta');
ALTER TABLE public.platform_tariffs ALTER COLUMN extra_fee_animal SET DEFAULT 5, ALTER COLUMN extra_fee_objeto SET DEFAULT 3;
DROP FUNCTION IF EXISTS public.admin_set_default_min_hourly(numeric, uuid);
DROP FUNCTION IF EXISTS public.get_default_min_hourly();
ALTER TABLE public.ride_negotiation_settings DROP COLUMN IF EXISTS default_min_hourly;
COMMIT;
