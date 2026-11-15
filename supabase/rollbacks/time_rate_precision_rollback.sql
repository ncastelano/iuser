-- Rollback de 20261130000050: volta a tarifa por tempo para 2 casas (arredonda o que tiver mais) e o piso para cima em centavos.
BEGIN;
CREATE OR REPLACE FUNCTION public._time_rate_floor() RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT ceil(COALESCE((SELECT default_min_hourly FROM public.ride_negotiation_settings), 40) / 60.0 * 100) / 100 $$;
DROP TRIGGER IF EXISTS driver_pricing_time_floor ON public.driver_pricing;
ALTER TABLE public.driver_pricing ALTER COLUMN price_per_minute TYPE numeric(6,2);
CREATE TRIGGER driver_pricing_time_floor BEFORE INSERT OR UPDATE OF price_per_minute ON public.driver_pricing FOR EACH ROW EXECUTE FUNCTION public.guard_driver_price_per_minute();
COMMIT;
