-- 20261130000050_time_rate_precision.sql
-- A "Minha tarifa por tempo" passa a ser escolhida em R$ POR HORA (mínimo R$ 40, o padrão do iUser) e guardada por minuto com 4 casas: R$ 40/h = R$ 0,6667/min
-- (com 2 casas virava R$ 0,67 = R$ 40,20/h). O piso é exatamente o padrão ÷ 60, sem arredondar para cima.
BEGIN;

-- o gatilho do piso depende da coluna: sai, a coluna muda de tipo, o gatilho volta
DROP TRIGGER IF EXISTS driver_pricing_time_floor ON public.driver_pricing;
ALTER TABLE public.driver_pricing ALTER COLUMN price_per_minute TYPE numeric(8,4);
CREATE TRIGGER driver_pricing_time_floor BEFORE INSERT OR UPDATE OF price_per_minute ON public.driver_pricing FOR EACH ROW EXECUTE FUNCTION public.guard_driver_price_per_minute();

CREATE OR REPLACE FUNCTION public._time_rate_floor() RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT round(COALESCE((SELECT default_min_hourly FROM public.ride_negotiation_settings), 40) / 60.0, 4) $$;

-- valores gravados com o arredondamento antigo (R$ 0,67 = R$ 40,20/h) ficam como estão: continuam acima do piso exato

COMMIT;
