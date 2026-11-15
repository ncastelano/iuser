-- ENTREGADOR DESISTIU DEPOIS DE ACEITAR → A ENTREGA VOLTA A PROCURAR OUTRO SOZINHA (decisão do dono, 11/11/2026).
-- Antes: o motorista cancelava a corrida de um pedido de loja e a busca acabava junto (corrida e entrega 'cancelled'); o pedido ficava com a loja
-- SEM entregador ("Sem entregador" no painel) e o aviso à loja dizia "volta a procurar motorista", mas nada procurava.
-- Agora (fluxo V1; o V2 já reabre pela liberação da reserva): se o pedido ainda está em andamento e o motorista ainda NÃO retirou (sem ride_started_at),
-- logo depois do cancelamento a mesma corrida volta a 'pending' sem motorista, a entrega volta a 'searching', os motoristas do raio são avisados
-- (fila order_delivery_events 'round_started' → /api/internal/delivery-events) e o primeiro que se candidatar pelo frete fica com ela (como sempre).
-- Quem desistiu não pega a mesma entrega de novo (a candidatura dele fica 'rejected'); os que tinham perdido podem se candidatar outra vez.
-- Depois de retirar o pedido, cancelar não reabre (o pedido está com ele: vira contestação/ocorrência).

CREATE OR REPLACE FUNCTION public.ride_requests_reopen_after_driver_cancel()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE d record; v_order_status text;
BEGIN
    IF NEW.order_id IS NULL OR OLD.status <> 'accepted' OR NEW.status <> 'cancelled' OR NEW.cancelled_by IS DISTINCT FROM 'driver'
       OR OLD.ride_started_at IS NOT NULL OR OLD.driver_id IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT id, flow_version INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = NEW.id;
    IF d.id IS NULL OR d.flow_version <> 1 THEN RETURN NULL; END IF;
    SELECT status INTO v_order_status FROM public.orders WHERE id = NEW.order_id;
    IF v_order_status IS NULL OR v_order_status NOT IN ('pending', 'preparing', 'ready') THEN RETURN NULL; END IF;

    -- quem desistiu não volta a pegar esta entrega; quem tinha perdido pode tentar de novo
    UPDATE public.ride_applications SET status = 'rejected' WHERE ride_request_id = NEW.id AND applicant_id = OLD.driver_id;
    DELETE FROM public.ride_applications WHERE ride_request_id = NEW.id AND applicant_id <> OLD.driver_id AND status = 'rejected';

    UPDATE public.ride_requests
       SET status = 'pending', driver_id = NULL, cancelled_by = NULL,
           driver_en_route = false, driver_departed_at = NULL, driver_arrived_at = NULL, arrived_destination_at = NULL,
           exclusive_until = NULL, share_closed_at = NULL, applicant_count = 0
     WHERE id = NEW.id;

    UPDATE public.order_delivery_dispatches SET status = 'searching', stage = 'searching', updated_at = now() WHERE id = d.id;

    INSERT INTO public.order_delivery_events (dispatch_id, kind, data)
    VALUES (d.id, 'round_started', jsonb_build_object('reason', 'driver_cancelled', 'driver_id', OLD.driver_id));
    PERFORM public._ping_delivery_events();
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ride_requests_reopen_after_driver_cancel() FROM PUBLIC, anon, authenticated;

-- "zzz": roda DEPOIS dos outros gatilhos AFTER (sincronia da entrega, avisos, caixa), que já registraram o cancelamento
DROP TRIGGER IF EXISTS zzz_ride_requests_reopen_delivery ON public.ride_requests;
CREATE TRIGGER zzz_ride_requests_reopen_delivery AFTER UPDATE OF status ON public.ride_requests
    FOR EACH ROW WHEN (NEW.order_id IS NOT NULL AND OLD.status = 'accepted' AND NEW.status = 'cancelled')
    EXECUTE FUNCTION public.ride_requests_reopen_after_driver_cancel();
