-- Desfaz a 20261130000068 (ciclo das entregas). Os tipos novos de aviso ficam aceitos no CHECK (avisos já gravados não quebram).
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('delivery-cycle-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delivery-cycle-tick');
    END IF;
END $$;
DROP FUNCTION IF EXISTS public.process_delivery_cycle();
DROP TRIGGER IF EXISTS orders_zzz_count_reject_after_driver ON public.orders;
DROP FUNCTION IF EXISTS public.orders_count_reject_after_driver();
DROP TRIGGER IF EXISTS ride_applications_quit_block ON public.ride_applications;
DROP FUNCTION IF EXISTS public.ride_applications_quit_block();
DROP TRIGGER IF EXISTS orders_refuse_closed_store ON public.orders;
DROP FUNCTION IF EXISTS public.orders_refuse_closed_store();
DROP FUNCTION IF EXISTS public._store_open_now(jsonb, timestamptz);
DROP FUNCTION IF EXISTS public.get_my_staff_pickup_codes();
DROP TRIGGER IF EXISTS orders_set_store_visible_at ON public.orders;
DROP FUNCTION IF EXISTS public.orders_set_store_visible_at();
-- cancel_held_order volta a valer só para pedido retido
CREATE OR REPLACE FUNCTION public.cancel_held_order(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND OR o.buyer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF o.store_visible OR o.status <> 'pending' THEN RAISE EXCEPTION 'Este pedido já está com a loja' USING HINT = 'not_held'; END IF;
    UPDATE public.orders SET status = 'rejected', closed_reason = 'customer_cancelled' WHERE id = o.id;
    RETURN jsonb_build_object('ok', true);
END $$;
-- código de retirada volta a ser só do dono
CREATE OR REPLACE FUNCTION public._is_store_staff(p_store uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store AND s.owner_id = auth.uid())
$$;
-- a desistência deixa de contar: volta a função da ...67 (antes de apagar _cycle_driver_strike, que ela chamaria)
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

DROP FUNCTION IF EXISTS public._cycle_driver_strike(uuid, text, uuid, uuid);
DROP TABLE IF EXISTS public.driver_cycle_blocks;
DROP TABLE IF EXISTS public.delivery_cycle_events;
DROP TABLE IF EXISTS public.delivery_cycle_settings;
ALTER TABLE public.orders DROP COLUMN IF EXISTS store_visible_at;
