-- MÍNIMO DA PLATAFORMA = R$ 40 POR HORA de trabalho (11/11/2026, decisão do dono: "o valor mínimo dos minutos é o valor de 40 reais por hora").
-- Era R$ 0,80 por minuto (= R$ 48/h) e a coluna só guardava 2 casas (R$ 40/h ÷ 60 = 0,6667 virava 0,67 = R$ 40,20/h). Agora a coluna guarda 4
-- casas, o padrão é 40 ÷ 60 e o valor de fábrica passa a ele (só se ninguém o tinha editado: 0,80). O Admin passa a editar EM REAIS POR HORA.
-- Também anota no Financeiro o uso da Matrix API do Mapbox (distância e tempo reais das estimativas do /pedir-motorista).
-- Rollback: supabase/rollbacks/platform_min_hourly_rollback.sql
ALTER TABLE public.ride_negotiation_settings
    ALTER COLUMN min_per_minute TYPE numeric(8,4),
    ALTER COLUMN max_per_minute TYPE numeric(8,4);
ALTER TABLE public.ride_negotiation_settings ALTER COLUMN min_per_minute SET DEFAULT 0.6667;
UPDATE public.ride_negotiation_settings SET min_per_minute = 0.6667 WHERE min_per_minute = 0.80;

CREATE OR REPLACE FUNCTION public.admin_set_ride_minimum(p_value numeric, p_admin uuid DEFAULT NULL::uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_old numeric; v_cap numeric; v numeric := round(COALESCE(p_value, 0), 4);   -- 4 casas: R$ 40/h = 0,6667 por minuto
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
END; $function$;

UPDATE public.service_expenses
   SET notes = notes || ' · Matrix API (distância e tempo reais pelas ruas das estimativas de corrida da página de chegada do /pedir-motorista: src/components/ride/PlaceSearchExtras.tsx; uma consulta por abertura, até 24 lugares)',
       updated_at = now()
 WHERE service_name = 'Mapbox'
   AND notes NOT LIKE '%Matrix API%';
