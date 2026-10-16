-- Contraproposta do motorista na entrega iUser: além de aceitar o frete da rodada, ele pode
-- propor o valor da "Minha tarifa" dele. O valor é calculado no servidor (nunca vem do app) e
-- só vale se o CLIENTE autorizar — mesma regra do reajuste: o custo é do cliente, nunca da
-- loja nem do iUser, e nada é cobrado sem autorização expressa.
-- Aceita a contraproposta, o pedido passa a cobrar esse valor e o motorista fica com a entrega.

ALTER TABLE public.order_delivery_rounds DROP CONSTRAINT IF EXISTS order_delivery_rounds_kind_check;
ALTER TABLE public.order_delivery_rounds
    ADD CONSTRAINT order_delivery_rounds_kind_check CHECK (kind IN ('initial', 'increase', 'radius_only', 'driver_counter'));
ALTER TABLE public.order_delivery_rounds ADD COLUMN IF NOT EXISTS proposed_by uuid;

CREATE TABLE IF NOT EXISTS public.order_delivery_counters (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id   uuid NOT NULL REFERENCES public.order_delivery_dispatches(id) ON DELETE CASCADE,
    driver_id     uuid NOT NULL,
    amount        numeric NOT NULL CHECK (amount > 0),     -- frete final que o cliente pagaria
    platform_fee  numeric NOT NULL DEFAULT 0,
    driver_offer  numeric NOT NULL,                         -- o que o motorista recebe
    status        text NOT NULL DEFAULT 'pending_customer' CHECK (status IN ('pending_customer', 'authorized', 'declined', 'expired')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    decided_at    timestamptz,
    UNIQUE (dispatch_id, driver_id)
);
CREATE INDEX IF NOT EXISTS order_delivery_counters_pending_idx ON public.order_delivery_counters (dispatch_id) WHERE status = 'pending_customer';

ALTER TABLE public.order_delivery_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS odc_select ON public.order_delivery_counters;
CREATE POLICY odc_select ON public.order_delivery_counters FOR SELECT TO authenticated
    USING (driver_id = auth.uid() OR dispatch_id IN (SELECT id FROM public.order_delivery_dispatches WHERE customer_id = auth.uid()));
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_delivery_counters;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;

-- Só o servidor cria (valor calculado pela tarifa do motorista); o motorista chama a rota.
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

    -- mesmo raio da candidatura
    SELECT live_lat, live_lng, live_updated_at INTO dp FROM public.driver_pricing WHERE driver_id = p_driver;
    IF r.visible_radius_km IS NOT NULL AND r.origin_lat IS NOT NULL AND dp.live_lat IS NOT NULL AND dp.live_updated_at > now() - interval '30 minutes'
       AND public.haversine_km(r.origin_lat, r.origin_lng, dp.live_lat, dp.live_lng) > r.visible_radius_km THEN
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

-- O cliente decide a contraproposta.
CREATE OR REPLACE FUNCTION public.respond_delivery_counter(p_counter uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    c public.order_delivery_counters;
    d public.order_delivery_dispatches;
    cfg public.delivery_dispatch_settings;
    v_ride_status text;
    v_old_fee numeric;
    v_offered numeric;
BEGIN
    SELECT * INTO c FROM public.order_delivery_counters WHERE id = p_counter FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada'; END IF;
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = c.dispatch_id FOR UPDATE;
    IF d.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
    IF c.status <> 'pending_customer' THEN RAISE EXCEPTION 'Essa proposta não está mais disponível'; END IF;

    SELECT status INTO v_ride_status FROM public.ride_requests WHERE id = d.ride_request_id;
    IF d.status <> 'searching' OR v_ride_status IS DISTINCT FROM 'pending' THEN
        UPDATE public.order_delivery_counters SET status = 'expired', decided_at = now() WHERE id = c.id;
        RAISE EXCEPTION 'A entrega já não está em busca';
    END IF;

    IF NOT p_accept THEN
        UPDATE public.order_delivery_counters SET status = 'declined', decided_at = now() WHERE id = c.id;
        RETURN jsonb_build_object('accepted', false);
    END IF;

    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;
    IF c.amount > cfg.max_freight THEN RAISE EXCEPTION 'Valor acima do máximo permitido'; END IF;

    SELECT delivery_fee INTO v_old_fee FROM public.orders WHERE id = d.order_id;
    UPDATE public.orders
       SET delivery_fee = c.amount, total_amount = total_amount - COALESCE(v_old_fee, 0) + c.amount
     WHERE id = d.order_id;

    UPDATE public.order_delivery_counters SET status = 'authorized', decided_at = now() WHERE id = c.id;
    UPDATE public.order_delivery_counters SET status = 'expired', decided_at = now() WHERE dispatch_id = d.id AND id <> c.id AND status = 'pending_customer';
    UPDATE public.order_delivery_rounds SET status = 'expired' WHERE dispatch_id = d.id AND status = 'pending_customer';

    INSERT INTO public.order_delivery_rounds (dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status, authorized_at, authorized_by, proposed_by)
    VALUES (d.id, d.round + 1, 'driver_counter', d.original_freight, c.amount - d.original_freight, c.amount, c.platform_fee, c.driver_offer, d.radius_km, 'authorized', now(), auth.uid(), c.driver_id);
    UPDATE public.order_delivery_dispatches
       SET round = d.round + 1, authorized_extra = c.amount - d.original_freight, final_freight = c.amount, round_started_at = now(), updated_at = now()
     WHERE id = d.id;
    UPDATE public.ride_requests SET offered_price = c.driver_offer WHERE id = d.ride_request_id;

    -- o motorista que propôs fica com a entrega (a candidatura no valor da corrida o aceita sozinha)
    PERFORM set_config('app.skip_delivery_radius', '1', true);
    INSERT INTO public.ride_applications (ride_request_id, applicant_id, status, proposed_price)
    VALUES (d.ride_request_id, c.driver_id, 'pending', c.driver_offer)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('accepted', true, 'final_freight', c.amount, 'driver_offer', c.driver_offer);
END;
$$;
GRANT EXECUTE ON FUNCTION public.respond_delivery_counter(uuid, boolean) TO authenticated;

-- A candidatura criada na autorização do cliente não é barrada pelo raio (o motorista já foi validado ao propor).
CREATE OR REPLACE FUNCTION public.enforce_delivery_radius()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    rr record;
    dp record;
    v_km numeric;
BEGIN
    IF current_setting('app.skip_delivery_radius', true) = '1' THEN RETURN NEW; END IF;
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

-- A corrida deixou de estar pendente: propostas abertas vencem.
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
            UPDATE public.order_delivery_counters SET status = 'expired', decided_at = now()
             WHERE status = 'pending_customer' AND dispatch_id IN (SELECT id FROM public.order_delivery_dispatches WHERE ride_request_id = NEW.id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
