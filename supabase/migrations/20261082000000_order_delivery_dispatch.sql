-- Entrega iUser dos pedidos da loja: oferta automática aos motoristas, raio de busca e
-- reajuste do frete SOMENTE com autorização do cliente.
--
-- Regras (todas no banco; o app nunca manda valor):
--  * Quando a loja aceita (pending → preparing) um pedido com entrega numa loja com
--    entregador iUser, nasce a oferta: uma corrida de objeto com o frete que o cliente já
--    pagou no checkout (= Tarifa iUser, ver 20261081000000) e raio inicial de busca.
--  * Se ninguém aceita no intervalo definido (Admin → Entregas), o raio aumenta e o sistema
--    PROPÕE ao cliente um frete maior. Nada é cobrado sem o "Aceitar novo valor" dele.
--  * Cada rodada fica registrada: frete original, acréscimo autorizado, frete final, valor
--    oferecido ao entregador, quando e por quem foi autorizado.
--  * O acréscimo é do cliente: nunca sai do repasse da loja nem é subsidiado pelo iUser.
--    orders.delivery_fee / total_amount passam a ser o último valor autorizado pelo cliente.
--  * O motorista só aceita o valor da rodada (ride_requests.offered_price); ele não define preço.

-- ============================================================
-- 1. Configurações (uma linha só) — editadas em Admin → Entregas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.delivery_dispatch_settings (
    id                       boolean PRIMARY KEY DEFAULT true CHECK (id),
    retry_interval_minutes   integer NOT NULL DEFAULT 5   CHECK (retry_interval_minutes BETWEEN 1 AND 240),
    increase_kind            text    NOT NULL DEFAULT 'fixed' CHECK (increase_kind IN ('fixed', 'percent')),
    increase_value           numeric NOT NULL DEFAULT 2   CHECK (increase_value >= 0),
    initial_radius_km        numeric NOT NULL DEFAULT 5   CHECK (initial_radius_km > 0),
    radius_step_km           numeric NOT NULL DEFAULT 3   CHECK (radius_step_km >= 0),
    max_freight              numeric NOT NULL DEFAULT 60  CHECK (max_freight > 0),
    max_rounds               integer NOT NULL DEFAULT 5   CHECK (max_rounds BETWEEN 0 AND 50),
    platform_fee_percent     numeric NOT NULL DEFAULT 0   CHECK (platform_fee_percent BETWEEN 0 AND 100),
    updated_at               timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.delivery_dispatch_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.delivery_dispatch_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_settings_read ON public.delivery_dispatch_settings;
CREATE POLICY delivery_settings_read ON public.delivery_dispatch_settings FOR SELECT TO authenticated USING (true);
-- escrita só pelo service role (rota admin, requireSuperAdmin)

-- ============================================================
-- 2. A entrega de cada pedido e o histórico de rodadas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_delivery_dispatches (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id           uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    ride_request_id    uuid REFERENCES public.ride_requests(id) ON DELETE SET NULL,
    store_id           uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id        uuid,
    status             text NOT NULL DEFAULT 'searching' CHECK (status IN ('searching', 'accepted', 'completed', 'cancelled')),
    round              integer NOT NULL DEFAULT 1,
    original_freight   numeric NOT NULL,
    authorized_extra   numeric NOT NULL DEFAULT 0,
    final_freight      numeric NOT NULL,
    radius_km          numeric NOT NULL,
    round_started_at   timestamptz NOT NULL DEFAULT now(),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_delivery_dispatches_searching_idx ON public.order_delivery_dispatches (round_started_at) WHERE status = 'searching';
CREATE INDEX IF NOT EXISTS order_delivery_dispatches_customer_idx ON public.order_delivery_dispatches (customer_id);

CREATE TABLE IF NOT EXISTS public.order_delivery_rounds (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id       uuid NOT NULL REFERENCES public.order_delivery_dispatches(id) ON DELETE CASCADE,
    round             integer NOT NULL,
    kind              text NOT NULL CHECK (kind IN ('initial', 'increase', 'radius_only')),
    original_freight  numeric NOT NULL,
    extra             numeric NOT NULL DEFAULT 0,           -- acréscimo acumulado até esta rodada
    final_freight     numeric NOT NULL,                      -- o que o cliente paga se autorizar
    platform_fee      numeric NOT NULL DEFAULT 0,            -- taxa da plataforma, contabilizada à parte
    driver_offer      numeric NOT NULL,                      -- o que o entregador recebe
    radius_km         numeric NOT NULL,
    status            text NOT NULL CHECK (status IN ('authorized', 'pending_customer', 'declined', 'expired', 'radius_only')),
    proposed_at       timestamptz NOT NULL DEFAULT now(),
    authorized_at     timestamptz,
    authorized_by     uuid,
    UNIQUE (dispatch_id, round)
);
CREATE INDEX IF NOT EXISTS order_delivery_rounds_pending_idx ON public.order_delivery_rounds (dispatch_id) WHERE status = 'pending_customer';

ALTER TABLE public.order_delivery_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_delivery_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS odd_select ON public.order_delivery_dispatches;
CREATE POLICY odd_select ON public.order_delivery_dispatches FOR SELECT TO authenticated
    USING (customer_id = auth.uid() OR store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
DROP POLICY IF EXISTS odr_select ON public.order_delivery_rounds;
CREATE POLICY odr_select ON public.order_delivery_rounds FOR SELECT TO authenticated
    USING (dispatch_id IN (SELECT id FROM public.order_delivery_dispatches));
-- sem políticas de escrita: tudo passa pelas funções abaixo

-- A corrida só é visível aos motoristas dentro deste raio (km) a partir da loja.
ALTER TABLE public.ride_requests ADD COLUMN IF NOT EXISTS visible_radius_km numeric;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_delivery_dispatches;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_delivery_rounds;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;

-- ============================================================
-- 3. Distância em km (linha reta)
-- ============================================================
CREATE OR REPLACE FUNCTION public.haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT (6371 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2)
        + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    )))::numeric
$$;

-- ============================================================
-- 4. Nasce a oferta de entrega do pedido
-- ============================================================
CREATE OR REPLACE FUNCTION public._start_order_delivery_dispatch(p_order uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    o public.orders;
    s public.stores;
    cfg public.delivery_dispatch_settings;
    v_existing uuid;
    v_ride uuid;
    v_dispatch uuid;
    v_dist numeric;
    v_items text;
    v_fee numeric;
    v_platform numeric;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT id INTO v_existing FROM public.order_delivery_dispatches WHERE order_id = p_order;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

    SELECT * INTO s FROM public.stores WHERE id = o.store_id;
    IF NOT FOUND OR NOT s.iuser_delivery_enabled THEN RETURN NULL; END IF;
    IF o.delivery_address IS NULL OR COALESCE(o.delivery_fee, 0) <= 0 THEN RETURN NULL; END IF;
    IF s.address IS NULL OR s.store_lat IS NULL OR s.store_lng IS NULL THEN RETURN NULL; END IF;

    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;
    v_fee := o.delivery_fee;
    v_platform := round(v_fee * cfg.platform_fee_percent / 100, 2);

    IF o.delivery_lat IS NOT NULL AND o.delivery_lng IS NOT NULL THEN
        v_dist := round(public.haversine_km(s.store_lat, s.store_lng, o.delivery_lat, o.delivery_lng) * 1.3, 1);
    END IF;

    SELECT string_agg(quantity || 'x ' || product_name, ', ') INTO v_items FROM public.order_items WHERE order_id = o.id;

    -- corrida antiga do pedido (chamada manual de antes): reaproveita
    SELECT id INTO v_ride FROM public.ride_requests WHERE order_id = o.id AND status <> 'cancelled' LIMIT 1;
    IF v_ride IS NULL THEN
        INSERT INTO public.ride_requests (
            requester_id, ride_type, vehicle_type, origin_address, origin_lat, origin_lng,
            destination_address, destination_lat, destination_lng, distance_km, object_description,
            sender_name, recipient_name, offered_price, order_id, store_id, visible_radius_km
        ) VALUES (
            s.owner_id, 'objeto', 'moto', s.address, s.store_lat, s.store_lng,
            o.delivery_address, o.delivery_lat, o.delivery_lng, v_dist,
            left('Pedido da loja ' || s.name || COALESCE(': ' || v_items, ''), 300),
            s.name, o.buyer_name, v_fee - v_platform, o.id, s.id, cfg.initial_radius_km
        ) RETURNING id INTO v_ride;
    END IF;

    INSERT INTO public.order_delivery_dispatches (order_id, ride_request_id, store_id, customer_id, original_freight, final_freight, radius_km)
    VALUES (o.id, v_ride, s.id, o.buyer_id, v_fee, v_fee, cfg.initial_radius_km)
    RETURNING id INTO v_dispatch;

    INSERT INTO public.order_delivery_rounds (dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status, authorized_at, authorized_by)
    VALUES (v_dispatch, 1, 'initial', v_fee, 0, v_fee, v_platform, v_fee - v_platform, cfg.initial_radius_km, 'authorized', now(), o.buyer_id);

    RETURN v_dispatch;
END;
$$;
REVOKE ALL ON FUNCTION public._start_order_delivery_dispatch(uuid) FROM PUBLIC, anon, authenticated;

-- A loja aceitou o pedido: abre a oferta (nunca derruba a atualização do pedido).
CREATE OR REPLACE FUNCTION public.orders_start_delivery_on_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'preparing' AND OLD.status IS DISTINCT FROM 'preparing' THEN
        BEGIN
            PERFORM public._start_order_delivery_dispatch(NEW.id);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'delivery dispatch failed for order %: %', NEW.id, SQLERRM;
        END;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_start_delivery_on_accept ON public.orders;
CREATE TRIGGER orders_start_delivery_on_accept
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_start_delivery_on_accept();

-- Pedido que já estava em preparo (aceito antes desta regra): o dono da loja abre a oferta.
CREATE OR REPLACE FUNCTION public.start_my_order_delivery(p_order uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.orders o JOIN public.stores s ON s.id = o.store_id
        WHERE o.id = p_order AND s.owner_id = auth.uid() AND o.status IN ('preparing', 'ready')
    ) THEN
        RAISE EXCEPTION 'Sem permissão ou pedido ainda não aceito';
    END IF;
    RETURN public._start_order_delivery_dispatch(p_order);
END;
$$;
GRANT EXECUTE ON FUNCTION public.start_my_order_delivery(uuid) TO authenticated;

-- ============================================================
-- 5. Reajuste: a cada intervalo sem motorista, amplia o raio e propõe aumento ao cliente
-- ============================================================
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

        -- limite de tentativas: depois dele, segue buscando como está, sem novas propostas
        IF d.round - 1 >= cfg.max_rounds THEN CONTINUE; END IF;

        -- proposta anterior sem resposta: vence
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
            VALUES (d.id, d.round + 1, 'increase', d.original_freight, d.authorized_extra + v_inc, v_new_final, v_platform, v_new_final - v_platform, v_radius, 'pending_customer');
        ELSE
            v_platform := round(d.final_freight * cfg.platform_fee_percent / 100, 2);
            INSERT INTO public.order_delivery_rounds (dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status)
            VALUES (d.id, d.round + 1, 'radius_only', d.original_freight, d.authorized_extra, d.final_freight, v_platform, d.final_freight - v_platform, v_radius, 'radius_only');
        END IF;
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.process_order_delivery_dispatches() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'order-delivery-dispatch-tick';
SELECT cron.schedule('order-delivery-dispatch-tick', '* * * * *', $job$SELECT public.process_order_delivery_dispatches()$job$);

-- ============================================================
-- 6. O cliente decide: "Aceitar novo valor" / "Não aceitar"
-- ============================================================
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
    -- o pedido passa a cobrar exatamente o último frete autorizado pelo cliente
    UPDATE public.orders
       SET delivery_fee = r.final_freight,
           total_amount = total_amount - COALESCE(v_old_fee, 0) + r.final_freight
     WHERE id = d.order_id;

    UPDATE public.order_delivery_rounds SET status = 'authorized', authorized_at = now(), authorized_by = auth.uid() WHERE id = r.id;
    UPDATE public.order_delivery_dispatches
       SET authorized_extra = r.extra, final_freight = r.final_freight, round_started_at = now(), updated_at = now()
     WHERE id = d.id;
    UPDATE public.ride_requests SET offered_price = r.driver_offer WHERE id = d.ride_request_id;

    RETURN jsonb_build_object('accepted', true, 'final_freight', r.final_freight, 'driver_offer', r.driver_offer);
END;
$$;
GRANT EXECUTE ON FUNCTION public.respond_delivery_increase(uuid, boolean) TO authenticated;

-- O cliente desiste da entrega (sem motorista): a oferta é cancelada.
CREATE OR REPLACE FUNCTION public.cancel_order_delivery(p_dispatch uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    d public.order_delivery_dispatches;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch FOR UPDATE;
    IF NOT FOUND OR d.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
    IF d.status <> 'searching' THEN RAISE EXCEPTION 'A entrega já tem motorista ou foi encerrada'; END IF;
    UPDATE public.ride_requests SET status = 'cancelled', cancelled_by = 'requester' WHERE id = d.ride_request_id AND status = 'pending';
    UPDATE public.order_delivery_rounds SET status = 'expired' WHERE dispatch_id = d.id AND status = 'pending_customer';
    UPDATE public.order_delivery_dispatches SET status = 'cancelled', updated_at = now() WHERE id = d.id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_order_delivery(uuid) TO authenticated;

-- ============================================================
-- 7. A corrida anda → a entrega acompanha
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_dispatch_with_ride()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.order_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
        UPDATE public.order_delivery_dispatches
           SET status = CASE NEW.status WHEN 'accepted' THEN 'accepted' WHEN 'completed' THEN 'completed' WHEN 'cancelled' THEN 'cancelled' ELSE status END,
               updated_at = now()
         WHERE ride_request_id = NEW.id;
        IF NEW.status <> 'pending' THEN
            UPDATE public.order_delivery_rounds SET status = 'expired'
             WHERE status = 'pending_customer' AND dispatch_id IN (SELECT id FROM public.order_delivery_dispatches WHERE ride_request_id = NEW.id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ride_requests_sync_dispatch ON public.ride_requests;
CREATE TRIGGER ride_requests_sync_dispatch
    AFTER UPDATE OF status ON public.ride_requests
    FOR EACH ROW EXECUTE FUNCTION public.sync_dispatch_with_ride();

-- ============================================================
-- 8. Raio na candidatura: motorista longe demais não consegue aceitar
--    (sem localização recente dele, não bloqueia — a lista já filtra pelo aparelho)
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_delivery_radius()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    rr record;
    dp record;
    v_km numeric;
BEGIN
    SELECT order_id, visible_radius_km, origin_lat, origin_lng INTO rr FROM public.ride_requests WHERE id = NEW.ride_request_id;
    IF rr.order_id IS NULL OR rr.visible_radius_km IS NULL OR rr.origin_lat IS NULL THEN RETURN NEW; END IF;
    SELECT live_lat, live_lng, live_updated_at INTO dp FROM public.driver_pricing WHERE driver_id = NEW.applicant_id;
    IF dp.live_lat IS NULL OR dp.live_lng IS NULL OR dp.live_updated_at IS NULL OR dp.live_updated_at < now() - interval '30 minutes' THEN
        RETURN NEW;
    END IF;
    v_km := public.haversine_km(rr.origin_lat, rr.origin_lng, dp.live_lat, dp.live_lng);
    IF v_km > rr.visible_radius_km THEN
        RAISE EXCEPTION 'Essa entrega está fora do seu raio (% km da loja, raio atual de % km)', round(v_km, 1), rr.visible_radius_km
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ride_applications_enforce_radius ON public.ride_applications;
CREATE TRIGGER ride_applications_enforce_radius
    BEFORE INSERT ON public.ride_applications
    FOR EACH ROW EXECUTE FUNCTION public.enforce_delivery_radius();
