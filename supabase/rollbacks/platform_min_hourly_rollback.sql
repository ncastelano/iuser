-- Desfaz 20261130000065_platform_min_hourly.sql: volta o mínimo para R$ 0,80 por minuto (se ainda estava no de fábrica) e as 2 casas.
UPDATE public.ride_negotiation_settings SET min_per_minute = 0.80 WHERE min_per_minute = 0.6667;
ALTER TABLE public.ride_negotiation_settings ALTER COLUMN min_per_minute SET DEFAULT 0.80;
ALTER TABLE public.ride_negotiation_settings ALTER COLUMN min_per_minute TYPE numeric(6,2), ALTER COLUMN max_per_minute TYPE numeric(6,2);
CREATE OR REPLACE FUNCTION public.admin_set_ride_minimum(p_value numeric, p_admin uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old numeric; v_cap numeric; v numeric := round(COALESCE(p_value, 0), 2);
BEGIN
    SELECT min_per_minute, max_per_minute INTO v_old, v_cap FROM public.ride_negotiation_settings WHERE id;
    IF v < 0 THEN RAISE EXCEPTION 'O mínimo por minuto não pode ser negativo' USING ERRCODE = '22023'; END IF;
    IF v > v_cap THEN
        RAISE EXCEPTION 'O mínimo por minuto não pode passar de % (o teto só é elevado pelo administrador geral)', public._neg_money(v_cap) USING ERRCODE = '22023';
    END IF;
    UPDATE public.ride_negotiation_settings SET min_per_minute = v WHERE id;
    IF v_old IS DISTINCT FROM v THEN
        INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('ride_minimum', 'min_per_minute', to_jsonb(v_old), to_jsonb(v), p_admin);
    END IF;
    RETURN v;
END; $function$

;
UPDATE public.service_expenses SET notes = regexp_replace(notes, ' · Matrix API \(.*\)$', '') WHERE service_name = 'Mapbox';
