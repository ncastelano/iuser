-- Entrega iUser, 3 complementos:
--  (1) Avisos no celular do que acontece no banco (aumento proposto ao cliente, raio ampliado,
--      valor aumentado, pedido entregue): o banco enfileira um evento e chama a rota
--      /api/internal/delivery-events (pg_net), que envia os pushes. A rota só processa a fila
--      (nada que venha na chamada é usado), então não precisa de segredo.
--  (2) Raio escolhido pelo motorista: driver_pricing.delivery_radius_km (opcional). Vale o MENOR
--      entre o raio da oferta e o dele.
--  (3) Corrida finalizada → pedido finalizado ("entregue"), e a etapa da entrega (stage) fica
--      visível ao cliente e à loja.

ALTER TABLE public.delivery_dispatch_settings
    ADD COLUMN IF NOT EXISTS notify_url text NOT NULL DEFAULT 'https://www.iuser.com.br/api/internal/delivery-events';

ALTER TABLE public.driver_pricing
    ADD COLUMN IF NOT EXISTS delivery_radius_km numeric CHECK (delivery_radius_km IS NULL OR delivery_radius_km > 0);

ALTER TABLE public.order_delivery_dispatches
    ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'searching'
    CHECK (stage IN ('searching', 'assigned', 'to_store', 'at_store', 'in_transit', 'delivered', 'cancelled'));

CREATE TABLE IF NOT EXISTS public.order_delivery_events (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id   uuid NOT NULL REFERENCES public.order_delivery_dispatches(id) ON DELETE CASCADE,
    kind          text NOT NULL CHECK (kind IN ('tick', 'price_raised', 'delivered')),
    old_radius    numeric,
    new_radius    numeric,
    round_id      uuid,
    created_at    timestamptz NOT NULL DEFAULT now(),
    processed_at  timestamptz
);
CREATE INDEX IF NOT EXISTS order_delivery_events_pending_idx ON public.order_delivery_events (created_at) WHERE processed_at IS NULL;
ALTER TABLE public.order_delivery_events ENABLE ROW LEVEL SECURITY;   -- só o service role

CREATE OR REPLACE FUNCTION public._ping_delivery_events()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_url text;
BEGIN
    SELECT notify_url INTO v_url FROM public.delivery_dispatch_settings WHERE id;
    IF v_url IS NOT NULL AND v_url <> '' THEN
        PERFORM net.http_post(url := v_url, body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'delivery events ping failed: %', SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public._ping_delivery_events() FROM PUBLIC, anon, authenticated;

-- ---------- tick: agora também enfileira o aviso ----------
CREATE OR REPLACE FUNCTION public.process_order_delivery_dispatches()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    cfg public.delivery_dispatch_settings;
    d public.order_delivery_dispatches;
    v_ride_status text;
    v_inc numeric;
    v_new_final numeric;
    v_radius numeric;
    v_platform numeric;
    v_round uuid;
    v_count integer := 0;
BEGIN
    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;
    FOR d IN
        SELECT * FROM public.order_delivery_dispatches
        WHERE status = 'searching' AND round_started_at + make_interval(mins => cfg.retry_interval_minutes) <= now()
        FOR UPDATE SKIP LOCKED
    LOOP
        SELECT status INTO v_ride_status FROM public.ride_requests WHERE id = d.ride_request_id;
        IF v_ride_status IS DISTINCT FROM 'pending' THEN
            UPDATE public.order_delivery_dispatches
               SET status = CASE v_ride_status WHEN 'accepted' THEN 'accepted' WHEN 'completed' THEN 'completed' ELSE 'cancelled' END, updated_at = now()
             WHERE id = d.id;
            CONTINUE;
        END IF;

        IF d.round - 1 >= cfg.max_rounds THEN CONTINUE; END IF;

        UPDATE public.order_delivery_rounds SET status = 'expired' WHERE dispatch_id = d.id AND status = 'pending_customer';

        v_radius := d.radius_km + cfg.radius_step_km;
        v_inc := CASE cfg.increase_kind WHEN 'percent' THEN round(d.final_freight * cfg.increase_value / 100, 2) ELSE cfg.increase_value END;
        v_inc := LEAST(v_inc, cfg.max_freight - d.final_freight);
        IF v_inc < 0 THEN v_inc := 0; END IF;

        UPDATE public.ride_requests SET visible_radius_km = v_radius WHERE id = d.ride_request_id;
        UPDATE public.order_delivery_dispatches SET round = d.round + 1, radius_km = v_radius, round_started_at = now(), updated_at = now() WHERE id = d.id;

        IF v_inc > 0 THEN
            v_new_final := d.final_freight + v_inc;
            v_platform := round(v_new_final * cfg.platform_fee_percent / 100, 2);
            INSERT INTO public.order_delivery_rounds (dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status)
            VALUES (d.id, d.round + 1, 'increase', d.original_freight, d.authorized_extra + v_inc, v_new_final, v_platform, v_new_final - v_platform, v_radius, 'pending_customer')
            RETURNING id INTO v_round;
        ELSE
            v_platform := round(d.final_freight * cfg.platform_fee_percent / 100, 2);
            INSERT INTO public.order_delivery_rounds (dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status)
            VALUES (d.id, d.round + 1, 'radius_only', d.original_freight, d.authorized_extra, d.final_freight, v_platform, d.final_freight - v_platform, v_radius, 'radius_only')
            RETURNING id INTO v_round;
            v_round := NULL;
        END IF;
        INSERT INTO public.order_delivery_events (dispatch_id, kind, old_radius, new_radius, round_id) VALUES (d.id, 'tick', d.radius_km, v_radius, v_round);
        v_count := v_count + 1;
    END LOOP;
    IF v_count > 0 THEN PERFORM public._ping_delivery_events(); END IF;
    RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.process_order_delivery_dispatches() FROM PUBLIC, anon, authenticated;

-- ---------- cliente autoriza aumento: motoristas do raio ficam sabendo do novo valor ----------
CREATE OR REPLACE FUNCTION public.respond_delivery_increase(p_round uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    r public.order_delivery_rounds;
    d public.order_delivery_dispatches;
    cfg public.delivery_dispatch_settings;
    v_ride_status text;
    v_old_fee numeric;
BEGIN
    SELECT * INTO r FROM public.order_delivery_rounds WHERE id = p_round FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada'; END IF;
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = r.dispatch_id FOR UPDATE;
    IF d.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
    IF r.status <> 'pending_customer' THEN RAISE EXCEPTION 'Essa proposta não está mais disponível'; END IF;

    SELECT status INTO v_ride_status FROM public.ride_requests WHERE id = d.ride_request_id;
    IF d.status <> 'searching' OR v_ride_status IS DISTINCT FROM 'pending' THEN
        UPDATE public.order_delivery_rounds SET status = 'expired' WHERE id = r.id;
        RAISE EXCEPTION 'A entrega já não está em busca';
    END IF;

    IF NOT p_accept THEN
        UPDATE public.order_delivery_rounds SET status = 'declined' WHERE id = r.id;
        RETURN jsonb_build_object('accepted', false, 'final_freight', d.final_freight);
    END IF;

    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;
    IF r.final_freight > cfg.max_freight THEN RAISE EXCEPTION 'Valor acima do máximo permitido'; END IF;

    SELECT delivery_fee INTO v_old_fee FROM public.orders WHERE id = d.order_id;
    UPDATE public.orders
       SET delivery_fee = r.final_freight,
           total_amount = total_amount - COALESCE(v_old_fee, 0) + r.final_freight
     WHERE id = d.order_id;

    UPDATE public.order_delivery_rounds SET status = 'authorized', authorized_at = now(), authorized_by = auth.uid() WHERE id = r.id;
    UPDATE public.order_delivery_dispatches
       SET authorized_extra = r.extra, final_freight = r.final_freight, round_started_at = now(), updated_at = now()
     WHERE id = d.id;
    UPDATE public.ride_requests SET offered_price = r.driver_offer WHERE id = d.ride_request_id;

    INSERT INTO public.order_delivery_events (dispatch_id, kind, new_radius, round_id) VALUES (d.id, 'price_raised', d.radius_km, r.id);
    PERFORM public._ping_delivery_events();

    RETURN jsonb_build_object('accepted', true, 'final_freight', r.final_freight, 'driver_offer', r.driver_offer);
END;
$$;
GRANT EXECUTE ON FUNCTION public.respond_delivery_increase(uuid, boolean) TO authenticated;

-- ---------- raio do motorista (o menor vale) ----------
CREATE OR REPLACE FUNCTION public.enforce_delivery_radius()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    rr record;
    dp record;
    v_km numeric;
    v_limit numeric;
BEGIN
    IF current_setting('app.skip_delivery_radius', true) = '1' THEN RETURN NEW; END IF;
    SELECT order_id, visible_radius_km, origin_lat, origin_lng INTO rr FROM public.ride_requests WHERE id = NEW.ride_request_id;
    IF rr.order_id IS NULL OR rr.visible_radius_km IS NULL OR rr.origin_lat IS NULL THEN RETURN NEW; END IF;
    SELECT live_lat, live_lng, live_updated_at, delivery_radius_km INTO dp FROM public.driver_pricing WHERE driver_id = NEW.applicant_id;
    IF dp.live_lat IS NULL OR dp.live_lng IS NULL OR dp.live_updated_at IS NULL OR dp.live_updated_at < now() - interval '30 minutes' THEN
        RETURN NEW;
    END IF;
    v_limit := LEAST(rr.visible_radius_km, COALESCE(dp.delivery_radius_km, rr.visible_radius_km));
    v_km := public.haversine_km(rr.origin_lat, rr.origin_lng, dp.live_lat, dp.live_lng);
    IF v_km > v_limit THEN
        RAISE EXCEPTION 'Essa entrega está fora do seu raio (% km da loja, raio atual de % km)', round(v_km, 1), v_limit
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

-- create_delivery_counter respeita o raio do motorista também
CREATE OR REPLACE FUNCTION public.create_delivery_counter(p_ride uuid, p_driver uuid, p_amount numeric)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    d public.order_delivery_dispatches;
    cfg public.delivery_dispatch_settings;
    r record;
    dp record;
    v_platform numeric;
    v_id uuid;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = p_ride FOR UPDATE;
    IF NOT FOUND OR d.status <> 'searching' THEN RAISE EXCEPTION 'Essa entrega não está mais em busca'; END IF;
    SELECT requester_id, status, origin_lat, origin_lng, visible_radius_km INTO r FROM public.ride_requests WHERE id = p_ride;
    IF r.status <> 'pending' THEN RAISE EXCEPTION 'Essa entrega não está mais disponível'; END IF;
    IF r.requester_id = p_driver THEN RAISE EXCEPTION 'Você não pode propor na sua própria entrega'; END IF;

    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;
    IF p_amount <= d.final_freight THEN RAISE EXCEPTION 'A sua tarifa não é maior que o frete oferecido: aceite o frete'; END IF;
    IF p_amount > cfg.max_freight THEN RAISE EXCEPTION 'Valor acima do máximo permitido para entregas'; END IF;

    IF NOT (SELECT has_driver FROM public.get_active_plan_grants(p_driver)) THEN RAISE EXCEPTION 'Você precisa do plano de motorista'; END IF;
    IF public.get_driver_postpaid_debt(p_driver) >= 50 THEN RAISE EXCEPTION 'Quite sua pendência para aceitar corridas'; END IF;

    SELECT live_lat, live_lng, live_updated_at, delivery_radius_km INTO dp FROM public.driver_pricing WHERE driver_id = p_driver;
    IF r.visible_radius_km IS NOT NULL AND r.origin_lat IS NOT NULL AND dp.live_lat IS NOT NULL AND dp.live_updated_at > now() - interval '30 minutes'
       AND public.haversine_km(r.origin_lat, r.origin_lng, dp.live_lat, dp.live_lng) > LEAST(r.visible_radius_km, COALESCE(dp.delivery_radius_km, r.visible_radius_km)) THEN
        RAISE EXCEPTION 'Essa entrega está fora do seu raio' USING ERRCODE = '42501';
    END IF;

    v_platform := round(p_amount * cfg.platform_fee_percent / 100, 2);
    INSERT INTO public.order_delivery_counters (dispatch_id, driver_id, amount, platform_fee, driver_offer)
    VALUES (d.id, p_driver, p_amount, v_platform, p_amount - v_platform)
    RETURNING id INTO v_id;
    RETURN v_id;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Você já enviou uma proposta para essa entrega';
END;
$$;
REVOKE ALL ON FUNCTION public.create_delivery_counter(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;

-- ---------- a corrida anda: etapa da entrega; finalizada → pedido finalizado ----------
CREATE OR REPLACE FUNCTION public.sync_dispatch_with_ride()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    d public.order_delivery_dispatches;
    v_stage text;
BEGIN
    IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = NEW.id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    v_stage := CASE
        WHEN NEW.status = 'cancelled' THEN 'cancelled'
        WHEN NEW.status = 'completed' THEN 'delivered'
        WHEN NEW.status = 'accepted' THEN
            CASE WHEN NEW.ride_started_at IS NOT NULL THEN 'in_transit'
                 WHEN NEW.driver_arrived_at IS NOT NULL THEN 'at_store'
                 WHEN NEW.driver_departed_at IS NOT NULL THEN 'to_store'
                 ELSE 'assigned' END
        ELSE 'searching' END;

    UPDATE public.order_delivery_dispatches
       SET stage = v_stage,
           status = CASE NEW.status WHEN 'accepted' THEN 'accepted' WHEN 'completed' THEN 'completed' WHEN 'cancelled' THEN 'cancelled' ELSE status END,
           updated_at = now()
     WHERE id = d.id;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status <> 'pending' THEN
            UPDATE public.order_delivery_rounds SET status = 'expired' WHERE status = 'pending_customer' AND dispatch_id = d.id;
            UPDATE public.order_delivery_counters SET status = 'expired', decided_at = now() WHERE status = 'pending_customer' AND dispatch_id = d.id;
        END IF;
        IF NEW.status = 'completed' THEN
            -- entregue: o pedido está finalizado
            UPDATE public.orders SET status = 'paid' WHERE id = d.order_id AND status IN ('preparing', 'ready');
            INSERT INTO public.order_delivery_events (dispatch_id, kind) VALUES (d.id, 'delivered');
            PERFORM public._ping_delivery_events();
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ride_requests_sync_dispatch ON public.ride_requests;
CREATE TRIGGER ride_requests_sync_dispatch
    AFTER UPDATE OF status, driver_departed_at, driver_arrived_at, ride_started_at ON public.ride_requests
    FOR EACH ROW EXECUTE FUNCTION public.sync_dispatch_with_ride();
