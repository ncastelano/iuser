-- 20261130000043_driver_tariff_defaults.sql
-- (1) Valor extra por tipo de corrida (pessoa/animal/objeto): ZERO em todos os veículos, de forma global (decisão do dono, 06/11/2026).
--     Atenção: o frete do "Entregador do iUser" das lojas é a tarifa de moto + o extra de objeto (apply_iuser_delivery_tariff); com o extra em 0 o frete cai nessa parcela.
-- (2) Ganho mínimo por hora PADRÃO do iUser (R$ 40/h): vale para o motorista que não definiu o dele; cada um pode mudar. Editável no Admin → Tarifas.
BEGIN;

UPDATE public.platform_tariffs SET extra_fee_pessoa = 0, extra_fee_animal = 0, extra_fee_objeto = 0, updated_at = now()
WHERE extra_fee_pessoa <> 0 OR extra_fee_animal <> 0 OR extra_fee_objeto <> 0;
ALTER TABLE public.platform_tariffs ALTER COLUMN extra_fee_animal SET DEFAULT 0, ALTER COLUMN extra_fee_objeto SET DEFAULT 0;

ALTER TABLE public.ride_negotiation_settings
    ADD COLUMN IF NOT EXISTS default_min_hourly numeric(8,2) NOT NULL DEFAULT 40 CONSTRAINT rns_default_min_hourly_check CHECK (default_min_hourly >= 1 AND default_min_hourly <= 1000);

CREATE OR REPLACE FUNCTION public.get_default_min_hourly() RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT default_min_hourly FROM public.ride_negotiation_settings WHERE id $$;
GRANT EXECUTE ON FUNCTION public.get_default_min_hourly() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_default_min_hourly(p_value numeric, p_admin uuid DEFAULT NULL) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_old numeric; v numeric := round(COALESCE(p_value, 0), 2);
BEGIN
    IF v < 1 OR v > 1000 THEN RAISE EXCEPTION 'O ganho mínimo por hora padrão deve ficar entre R$ 1 e R$ 1.000' USING ERRCODE = '22023'; END IF;
    SELECT default_min_hourly INTO v_old FROM public.ride_negotiation_settings WHERE id;
    UPDATE public.ride_negotiation_settings SET default_min_hourly = v WHERE id;
    IF v_old IS DISTINCT FROM v THEN
        INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('ride_minimum', 'default_min_hourly', to_jsonb(v_old), to_jsonb(v), p_admin);
    END IF;
    RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_default_min_hourly(numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_default_min_hourly(numeric, uuid) TO service_role;

COMMIT;
