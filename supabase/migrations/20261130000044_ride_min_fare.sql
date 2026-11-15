-- 20261130000044_ride_min_fare.sql
-- VALOR MÍNIMO DE UMA CORRIDA = R$ 8,00 (decisão do dono, 06/11/2026): nenhuma corrida de passageiro fecha por menos, além do mínimo por minuto de trabalho (o MAIOR dos dois vale).
-- Entrega de loja (frete fixo) continua de fora. Editável em Admin → Tarifas.
BEGIN;

ALTER TABLE public.ride_negotiation_settings
    ADD COLUMN IF NOT EXISTS min_ride_fare numeric(6,2) NOT NULL DEFAULT 8 CONSTRAINT rns_min_ride_fare_check CHECK (min_ride_fare >= 0 AND min_ride_fare <= 200);

CREATE OR REPLACE FUNCTION public._ride_min_fare() RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT min_ride_fare FROM public.ride_negotiation_settings), 8) $$;

CREATE OR REPLACE FUNCTION public.get_ride_min_fare() RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public._ride_min_fare() $$;
GRANT EXECUTE ON FUNCTION public.get_ride_min_fare() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_ride_min_fare(p_value numeric, p_admin uuid DEFAULT NULL) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_old numeric; v numeric := round(COALESCE(p_value, 0), 2);
BEGIN
    IF v < 0 OR v > 200 THEN RAISE EXCEPTION 'O valor mínimo da corrida deve ficar entre R$ 0 e R$ 200' USING ERRCODE = '22023'; END IF;
    SELECT min_ride_fare INTO v_old FROM public.ride_negotiation_settings WHERE id;
    UPDATE public.ride_negotiation_settings SET min_ride_fare = v WHERE id;
    IF v_old IS DISTINCT FROM v THEN
        INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('ride_minimum', 'min_ride_fare', to_jsonb(v_old), to_jsonb(v), p_admin);
    END IF;
    RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_ride_min_fare(numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_ride_min_fare(numeric, uuid) TO service_role;

-- O piso da corrida (usado pelas propostas, contrapropostas e candidaturas) passa a ser o MAIOR entre minutos × mínimo por minuto e o valor mínimo da corrida
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
    DECLARE pmin numeric := GREATEST(ceil(total * public._ride_min_per_minute() * 100) / 100, public._ride_min_fare()); below_p boolean := p_amount IS NOT NULL AND p_amount < GREATEST(ceil(total * public._ride_min_per_minute() * 100) / 100, public._ride_min_fare());
    BEGIN
        RETURN jsonb_build_object('minutes', round(total, 1), 'per_hour', perh, 'min_hourly', CASE WHEN FOUND THEN g.min_hourly END,
            'protection', CASE WHEN FOUND THEN g.protection ELSE 'warn' END, 'below', below,
            'platform_min', pmin, 'below_platform', below_p,
            'blocked', below_p OR (below AND FOUND AND g.protection = 'block'));
    END;
END; $function$;

COMMIT;
