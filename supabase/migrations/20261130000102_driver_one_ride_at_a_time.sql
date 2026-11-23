-- 20261130000102_driver_one_ride_at_a_time.sql — UMA CORRIDA POR VEZ (23/11/2026, decisão do dono).
-- Antes o motorista com uma corrida aceita/em andamento conseguia se candidatar e ser escolhido para outra.
-- Regra (no banco, vale para tela, API e chamada direta):
--   * corrida de PASSAGEIRO (sem pedido): só se o motorista não tem NENHUMA corrida/entrega aceita em andamento;
--   * entrega de LOJA: pode juntar várias entregas (a mochila já tem regra própria), mas não durante uma corrida de passageiro.
-- Vale na candidatura (ride_applications) e na escolha do motorista (ride_requests.driver_id + status 'accepted').
-- Rollback: supabase/rollbacks/driver_one_ride_at_a_time_rollback.sql

CREATE OR REPLACE FUNCTION public._driver_busy_for(p_driver uuid, p_ride uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_is_delivery boolean;
BEGIN
    SELECT order_id IS NOT NULL INTO v_is_delivery FROM public.ride_requests WHERE id = p_ride;
    IF v_is_delivery THEN
        RETURN EXISTS (SELECT 1 FROM public.ride_requests r
                       WHERE r.driver_id = p_driver AND r.status = 'accepted' AND r.order_id IS NULL AND r.id <> p_ride);
    END IF;
    RETURN EXISTS (SELECT 1 FROM public.ride_requests r
                   WHERE r.driver_id = p_driver AND r.status = 'accepted' AND r.id <> p_ride);
END $$;
REVOKE ALL ON FUNCTION public._driver_busy_for(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ride_applications_one_at_a_time()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF public._driver_busy_for(NEW.applicant_id, NEW.ride_request_id) THEN
        RAISE EXCEPTION 'Você já está com uma corrida em andamento. Termine ela antes de aceitar outra.'
            USING ERRCODE = 'P0001', HINT = 'driver_busy';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS b_ride_applications_one_at_a_time ON public.ride_applications;
CREATE TRIGGER b_ride_applications_one_at_a_time BEFORE INSERT ON public.ride_applications
    FOR EACH ROW EXECUTE FUNCTION public.ride_applications_one_at_a_time();

CREATE OR REPLACE FUNCTION public.ride_requests_one_at_a_time()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'accepted' AND NEW.driver_id IS NOT NULL
       AND (OLD.driver_id IS DISTINCT FROM NEW.driver_id OR OLD.status IS DISTINCT FROM 'accepted')
       AND public._driver_busy_for(NEW.driver_id, NEW.id) THEN
        RAISE EXCEPTION 'Este motorista acabou de ficar ocupado com outra corrida. Escolha outro candidato.'
            USING ERRCODE = 'P0001', HINT = 'driver_busy';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS b_ride_requests_one_at_a_time ON public.ride_requests;
CREATE TRIGGER b_ride_requests_one_at_a_time BEFORE UPDATE OF status, driver_id ON public.ride_requests
    FOR EACH ROW EXECUTE FUNCTION public.ride_requests_one_at_a_time();
