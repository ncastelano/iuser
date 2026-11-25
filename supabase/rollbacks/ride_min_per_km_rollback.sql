-- Desfaz 20261130000120: volta o piso da corrida ao de tempo + mínimo da corrida (sem km).
CREATE OR REPLACE FUNCTION public._ride_trip_floor(p_ride uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT CASE WHEN r.order_id IS NOT NULL THEN 0
                ELSE GREATEST(ceil(COALESCE(r.duration_min, r.distance_km / 40.0 * 60.0, 0) * public._ride_min_per_minute() * 100) / 100, public._ride_min_fare()) END
    FROM public.ride_requests r WHERE r.id = p_ride;
$function$;
DROP FUNCTION IF EXISTS public._ride_min_per_km();
ALTER TABLE public.ride_negotiation_settings DROP COLUMN IF EXISTS min_per_km;
