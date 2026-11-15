-- Rollback de 20261130000049: o motorista volta a poder baixar a tarifa por tempo e o ganho mínimo por hora (os valores já corrigidos para cima não voltam).
BEGIN;
DROP TRIGGER IF EXISTS driver_pricing_time_floor ON public.driver_pricing;
DROP TRIGGER IF EXISTS driver_earning_goals_floor ON public.driver_earning_goals;
DROP FUNCTION IF EXISTS public.guard_driver_price_per_minute();
DROP FUNCTION IF EXISTS public.guard_driver_earning_goal_floor();
DROP FUNCTION IF EXISTS public._time_rate_floor();
COMMIT;
