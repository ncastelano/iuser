-- 20261130000049_driver_time_floors.sql
-- PISO DO TEMPO DO MOTORISTA (decisão do dono, 06/11/2026): o ganho por hora do iUser (R$ 40 por padrão) é o MÍNIMO e o motorista só muda para CIMA:
--  • "Minha tarifa por tempo" (R$ por minuto) não pode ser menor que o padrão por hora ÷ 60, arredondado para cima (R$ 40/h → R$ 0,67 por minuto);
--  • "Meu ganho mínimo por hora" não pode ser menor que o padrão do iUser.
-- Vale quando o valor é gravado ou alterado (valor que já estava lá e não mudou não trava o resto da tarifa). Vazio (sem valor próprio) continua valendo: aí vale o padrão.
BEGIN;

CREATE OR REPLACE FUNCTION public._time_rate_floor() RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT ceil(COALESCE((SELECT default_min_hourly FROM public.ride_negotiation_settings), 40) / 60.0 * 100) / 100 $$;

CREATE OR REPLACE FUNCTION public.guard_driver_price_per_minute() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.price_per_minute IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND NEW.price_per_minute IS NOT DISTINCT FROM OLD.price_per_minute THEN RETURN NEW; END IF;
    IF NEW.price_per_minute < public._time_rate_floor() THEN
        RAISE EXCEPTION 'A tarifa por tempo não pode ser menor que % por minuto (o mínimo do iUser: % por hora)', public._neg_money(public._time_rate_floor()),
            public._neg_money((SELECT default_min_hourly FROM public.ride_negotiation_settings)) USING ERRCODE = '23514', HINT = 'below_time_floor';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS driver_pricing_time_floor ON public.driver_pricing;
CREATE TRIGGER driver_pricing_time_floor BEFORE INSERT OR UPDATE OF price_per_minute ON public.driver_pricing FOR EACH ROW EXECUTE FUNCTION public.guard_driver_price_per_minute();

CREATE OR REPLACE FUNCTION public.guard_driver_earning_goal_floor() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_def numeric := (SELECT default_min_hourly FROM public.ride_negotiation_settings);
BEGIN
    IF NEW.min_hourly IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND NEW.min_hourly IS NOT DISTINCT FROM OLD.min_hourly THEN RETURN NEW; END IF;
    IF NEW.min_hourly < v_def THEN
        RAISE EXCEPTION 'O ganho mínimo por hora não pode ser menor que % (o padrão do iUser): só dá para aumentar', public._neg_money(v_def) USING ERRCODE = '23514', HINT = 'below_hourly_floor';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS driver_earning_goals_floor ON public.driver_earning_goals;
CREATE TRIGGER driver_earning_goals_floor BEFORE INSERT OR UPDATE OF min_hourly ON public.driver_earning_goals FOR EACH ROW EXECUTE FUNCTION public.guard_driver_earning_goal_floor();

-- valores que já estavam abaixo do piso: o ganho mínimo volta a ser o padrão (vazio); a tarifa por tempo sobe ao piso
UPDATE public.driver_earning_goals SET min_hourly = NULL WHERE min_hourly IS NOT NULL AND min_hourly < (SELECT default_min_hourly FROM public.ride_negotiation_settings);
UPDATE public.driver_pricing SET price_per_minute = public._time_rate_floor() WHERE price_per_minute IS NOT NULL AND price_per_minute < public._time_rate_floor();

COMMIT;
