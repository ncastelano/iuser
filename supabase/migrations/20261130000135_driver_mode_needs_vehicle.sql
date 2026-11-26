-- 20261130000135 — o modo motorista só liga com um veículo cadastrado (decisão do dono, 26/11/2026). A tela já manda cadastrar;
-- aqui o banco também recusa, para nenhum caminho (API, outro aparelho, script) ligar o modo sem veículo.
-- Só confere quando o modo está sendo LIGADO; desligar sempre passa. Rollback: supabase/rollbacks/driver_mode_needs_vehicle_rollback.sql
CREATE OR REPLACE FUNCTION public.driver_pricing_needs_vehicle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.driver_mode_active IS TRUE AND (TG_OP = 'INSERT' OR OLD.driver_mode_active IS DISTINCT FROM TRUE) THEN
        IF NOT EXISTS (SELECT 1 FROM public.driver_vehicles v WHERE v.driver_id = NEW.driver_id) THEN
            RAISE EXCEPTION 'Cadastre seu veículo antes de ligar o modo motorista'
                USING ERRCODE = 'P0001', HINT = 'driver_vehicle_required';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS driver_pricing_needs_vehicle ON public.driver_pricing;
CREATE TRIGGER driver_pricing_needs_vehicle BEFORE INSERT OR UPDATE ON public.driver_pricing
    FOR EACH ROW EXECUTE FUNCTION public.driver_pricing_needs_vehicle();
