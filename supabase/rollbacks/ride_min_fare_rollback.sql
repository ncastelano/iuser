-- Rollback de 20261130000044: volta o piso da corrida a ser só minutos × mínimo por minuto e remove o valor mínimo da corrida.
BEGIN;
CREATE OR REPLACE FUNCTION public._ride_trip_floor(p_ride uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT CASE WHEN r.order_id IS NOT NULL THEN 0
                ELSE ceil(COALESCE(r.duration_min, r.distance_km / 40.0 * 60.0, 0) * public._ride_min_per_minute() * 100) / 100 END
    FROM public.ride_requests r WHERE r.id = p_ride;
$function$;

CREATE OR REPLACE FUNCTION public._ride_hourly(p_ride uuid, p_driver uuid, p_amount numeric, p_minutes numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r public.ride_requests; d public.driver_pricing; g public.driver_earning_goals;
    trip numeric; pick numeric := 0; total numeric; perh numeric; below boolean := false;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride;
    IF NOT FOUND THEN RETURN NULL; END IF;
    -- entrega de loja tem frete fixo e fica fora do ganho mínimo (o motorista aceita ou não, como sempre)
    IF r.order_id IS NOT NULL THEN RETURN jsonb_build_object('minutes', NULL, 'per_hour', NULL, 'min_hourly', NULL, 'protection', 'warn', 'below', false, 'platform_min', NULL, 'below_platform', false, 'blocked', false); END IF;
    trip := COALESCE(r.duration_min, r.distance_km / 40.0 * 60.0, 0);
    SELECT * INTO d FROM public.driver_pricing WHERE driver_id = p_driver;
    IF FOUND AND d.live_lat IS NOT NULL AND d.live_lng IS NOT NULL AND r.origin_lat IS NOT NULL AND r.origin_lng IS NOT NULL
       AND d.live_updated_at > now() - interval '30 minutes' THEN
        pick := (6371 * 2 * asin(sqrt(power(sin(radians(r.origin_lat - d.live_lat) / 2), 2)
                 + cos(radians(d.live_lat)) * cos(radians(r.origin_lat)) * power(sin(radians(r.origin_lng - d.live_lng) / 2), 2))) * 1.3) / 40.0 * 60.0;
    END IF;
    total := trip + pick;
    IF p_minutes IS NOT NULL AND p_minutes BETWEEN 5 AND 600 THEN total := p_minutes; END IF;   -- a estimativa que o motorista está vendo
    IF total > 0 AND p_amount IS NOT NULL THEN perh := round(p_amount / total * 60.0, 2); END IF;
    SELECT * INTO g FROM public.driver_earning_goals WHERE driver_id = p_driver;
    IF FOUND AND g.min_hourly IS NOT NULL AND perh IS NOT NULL THEN below := perh < g.min_hourly; END IF;
    DECLARE pmin numeric := ceil(total * public._ride_min_per_minute() * 100) / 100; below_p boolean := p_amount IS NOT NULL AND p_amount < ceil(total * public._ride_min_per_minute() * 100) / 100;
    BEGIN
        RETURN jsonb_build_object('minutes', round(total, 1), 'per_hour', perh, 'min_hourly', CASE WHEN FOUND THEN g.min_hourly END,
            'protection', CASE WHEN FOUND THEN g.protection ELSE 'warn' END, 'below', below,
            'platform_min', pmin, 'below_platform', below_p,
            'blocked', below_p OR (below AND FOUND AND g.protection = 'block'));
    END;
END; $function$;

DROP FUNCTION IF EXISTS public.admin_set_ride_min_fare(numeric, uuid);
DROP FUNCTION IF EXISTS public.get_ride_min_fare();
DROP FUNCTION IF EXISTS public._ride_min_fare();
ALTER TABLE public.ride_negotiation_settings DROP COLUMN IF EXISTS min_ride_fare;
COMMIT;
