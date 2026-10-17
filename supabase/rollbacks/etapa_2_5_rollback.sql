-- ROLLBACK da Etapa 2.5 (migration 20261100): volta ao estado da Etapa 2.4.1.
-- Remove a máquina de busca V2 (job, funções, autorização do cliente, colunas novas) e restaura as funções anteriores.
-- Recusa rodar se existir entrega V2 (apagaria o estado de busca dela).
-- Rode com: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/rollbacks/etapa_2_5_rollback.sql
begin;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.order_delivery_dispatches WHERE flow_version = 2) THEN
        RAISE EXCEPTION 'Existem entregas do fluxo V2; resolva-as antes de reverter a Etapa 2.5';
    END IF;
END $$;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'order-delivery-v2-tick';

DROP TRIGGER IF EXISTS ride_applications_v2_gate ON public.ride_applications;
DROP TRIGGER IF EXISTS order_delivery_dispatches_v2_sync_ride ON public.order_delivery_dispatches;
DROP TRIGGER IF EXISTS order_delivery_dispatches_v2_closed ON public.order_delivery_dispatches;
DROP FUNCTION IF EXISTS public.ride_applications_v2_gate();
DROP FUNCTION IF EXISTS public.dispatch_v2_sync_ride();
DROP FUNCTION IF EXISTS public.dispatch_v2_closed();
DROP FUNCTION IF EXISTS public.respond_delivery_reajust(uuid, boolean);
DROP FUNCTION IF EXISTS public.process_delivery_search_v2();
DROP FUNCTION IF EXISTS public._advance_delivery_search_v2(uuid);
DROP FUNCTION IF EXISTS public._v2_end_search(uuid, text);
DROP FUNCTION IF EXISTS public._v2_decide(public.order_delivery_dispatches, public.delivery_dispatch_settings);
DROP FUNCTION IF EXISTS public._v2_projected_limit(numeric, integer, public.delivery_dispatch_settings);
DROP FUNCTION IF EXISTS public._v2_next_price(numeric, public.delivery_dispatch_settings);
DROP FUNCTION IF EXISTS public._v2_auto_limit(numeric, public.delivery_dispatch_settings);

-- funções anteriores
CREATE OR REPLACE FUNCTION public.dispatch_phase_maintain()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_actor text;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.flow_version <> NEW.flow_version THEN
        RAISE EXCEPTION 'A versão do fluxo da entrega não muda depois de criada' USING ERRCODE = '42501';
    END IF;
    IF NEW.flow_version = 1 THEN
        -- fluxo atual: a fase é só um espelho de status/stage; ninguém decide por ela
        NEW.phase := public._legacy_delivery_phase(NEW.status, NEW.stage);
        IF TG_OP = 'INSERT' THEN
            NEW.estimated_freight := COALESCE(NEW.estimated_freight, NEW.original_freight);
        END IF;
        IF NEW.status IN ('accepted', 'completed') AND NEW.frozen_freight IS NULL THEN
            NEW.frozen_freight := NEW.final_freight;
            NEW.freight_frozen_at := now();
        END IF;
        IF TG_OP = 'INSERT' OR NEW.phase IS DISTINCT FROM OLD.phase THEN
            NEW.phase_changed_at := now();
        END IF;
    ELSE
        -- fluxo novo (ainda não criado por nada): fase obrigatória e só transições previstas para quem age
        IF NEW.phase IS NULL THEN RAISE EXCEPTION 'Entrega do novo fluxo exige a fase inicial'; END IF;
        -- frete definitivo: NULL até o motorista aceitar; no aceite recebe EXATAMENTE a oferta vigente (final_freight) e não muda mais
        IF TG_OP = 'INSERT' THEN
            IF NEW.frozen_freight IS NOT NULL OR NEW.freight_frozen_at IS NOT NULL THEN
                RAISE EXCEPTION 'O frete definitivo só é gravado no aceite do motorista' USING ERRCODE = '42501';
            END IF;
        ELSIF OLD.frozen_freight IS NULL THEN
            IF NEW.status IN ('accepted', 'completed') THEN
                NEW.frozen_freight := NEW.final_freight;
                NEW.freight_frozen_at := now();
            ELSIF NEW.frozen_freight IS NOT NULL OR NEW.freight_frozen_at IS NOT NULL THEN
                RAISE EXCEPTION 'O frete definitivo só é gravado no aceite do motorista' USING ERRCODE = '42501';
            END IF;
        END IF;
        IF TG_OP = 'UPDATE' AND NEW.phase IS DISTINCT FROM OLD.phase THEN
            v_actor := COALESCE(NULLIF(current_setting('app.delivery_actor', true), ''), 'system');
            IF NOT EXISTS (
                SELECT 1 FROM public.delivery_phase_transitions
                 WHERE from_phase = OLD.phase AND to_phase = NEW.phase AND actor_role = v_actor
            ) THEN
                RAISE EXCEPTION 'Transição de fase não permitida: % -> % (%)', OLD.phase, NEW.phase, v_actor USING ERRCODE = '42501';
            END IF;
            NEW.phase_changed_at := now();
        ELSIF TG_OP = 'INSERT' THEN
            NEW.phase_changed_at := now();
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_delivery_counter(p_ride uuid, p_driver uuid, p_amount numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public._start_order_delivery_dispatch(p_order uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    o public.orders;
    s public.stores;
    cfg public.delivery_dispatch_settings;
    est public.delivery_estimates;
    v_existing uuid;
    v_ride uuid;
    v_dispatch uuid;
    v_dist numeric;
    v_items text;
    v_fee numeric;
    v_platform numeric;
    v_v2 boolean;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_v2 := o.delivery_flow_version = 2;
    SELECT id INTO v_existing FROM public.order_delivery_dispatches WHERE order_id = p_order;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

    SELECT * INTO s FROM public.stores WHERE id = o.store_id;
    IF NOT FOUND OR NOT s.iuser_delivery_enabled THEN
        IF v_v2 THEN RAISE EXCEPTION 'A loja não usa mais o entregador iUser; não é possível aceitar este pedido' USING ERRCODE = '22023'; END IF;
        RETURN NULL;
    END IF;
    IF o.delivery_address IS NULL OR COALESCE(o.delivery_fee, 0) <= 0 THEN
        IF v_v2 THEN RAISE EXCEPTION 'Pedido sem endereço ou frete válido' USING ERRCODE = '22023'; END IF;
        RETURN NULL;
    END IF;
    IF s.address IS NULL OR s.store_lat IS NULL OR s.store_lng IS NULL THEN
        IF v_v2 THEN RAISE EXCEPTION 'A loja não tem endereço cadastrado' USING ERRCODE = '22023'; END IF;
        RETURN NULL;
    END IF;

    IF v_v2 THEN
        SELECT * INTO est FROM public.delivery_estimates WHERE order_id = o.id;
        IF NOT FOUND OR est.estimated_freight IS DISTINCT FROM o.delivery_fee THEN
            RAISE EXCEPTION 'Pedido V2 sem estimativa oficial vinculada' USING ERRCODE = '22023';
        END IF;
    END IF;

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

    IF v_v2 THEN
        -- estimated_freight é a estimativa original e nunca mais muda; a oferta (final_freight) parte dela
        INSERT INTO public.order_delivery_dispatches (order_id, ride_request_id, store_id, customer_id, original_freight, final_freight, radius_km,
                                                      flow_version, phase, estimated_freight, estimate_id)
        VALUES (o.id, v_ride, s.id, o.buyer_id, v_fee, v_fee, cfg.initial_radius_km,
                2, 'PROCURANDO_ENTREGADOR', est.estimated_freight, est.id)
        RETURNING id INTO v_dispatch;
    ELSE
        INSERT INTO public.order_delivery_dispatches (order_id, ride_request_id, store_id, customer_id, original_freight, final_freight, radius_km)
        VALUES (o.id, v_ride, s.id, o.buyer_id, v_fee, v_fee, cfg.initial_radius_km)
        RETURNING id INTO v_dispatch;
    END IF;

    INSERT INTO public.order_delivery_rounds (dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status, authorized_at, authorized_by)
    VALUES (v_dispatch, 1, 'initial', v_fee, 0, v_fee, v_platform, v_fee - v_platform, cfg.initial_radius_km, 'authorized', now(), o.buyer_id);

    RETURN v_dispatch;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delivery_rounds_v2_fence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.kind <> 'initial' AND EXISTS (SELECT 1 FROM public.order_delivery_dispatches d WHERE d.id = NEW.dispatch_id AND d.flow_version = 2) THEN
        RAISE EXCEPTION 'Reajuste e contraproposta do novo fluxo ainda não estão implementados' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public._ping_delivery_events()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_url text;
BEGIN
    SELECT notify_url INTO v_url FROM public.delivery_dispatch_settings WHERE id;
    IF v_url IS NOT NULL AND v_url <> '' THEN
        PERFORM net.http_post(url := v_url, body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'delivery events ping failed: %', SQLERRM;
END;
$function$;

DROP TABLE IF EXISTS public.delivery_reajust_authorizations;
DROP FUNCTION IF EXISTS public.dra_immutable();

DELETE FROM public.order_delivery_events WHERE kind IN ('round_started', 'reajust_requested', 'reajust_decided', 'search_ended');
DELETE FROM public.order_delivery_rounds WHERE kind = 'hold' OR status = 'accepted';
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_kind_check;
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_kind_check CHECK (kind IN (
    'tick', 'price_raised', 'delivered', 'phase_change', 'estimate_recorded', 'freight_frozen', 'driver_reserved', 'reservation_released',
    'payment_declared', 'cancelled', 'incident_opened', 'obligation_created', 'admin_decision'));
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_audit_processed_check;
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_audit_processed_check
    CHECK (kind IN ('tick', 'price_raised', 'delivered') OR processed_at IS NOT NULL);
ALTER TABLE public.order_delivery_rounds DROP CONSTRAINT IF EXISTS order_delivery_rounds_kind_check;
ALTER TABLE public.order_delivery_rounds ADD CONSTRAINT order_delivery_rounds_kind_check CHECK (kind IN ('initial', 'increase', 'radius_only', 'driver_counter'));
ALTER TABLE public.order_delivery_rounds DROP CONSTRAINT IF EXISTS order_delivery_rounds_status_check;
ALTER TABLE public.order_delivery_rounds ADD CONSTRAINT order_delivery_rounds_status_check CHECK (status IN ('authorized', 'pending_customer', 'declined', 'expired', 'radius_only'));
ALTER TABLE public.order_delivery_rounds DROP CONSTRAINT IF EXISTS order_delivery_rounds_action_check;
ALTER TABLE public.order_delivery_rounds
    DROP COLUMN IF EXISTS strategy, DROP COLUMN IF EXISTS action, DROP COLUMN IF EXISTS automatic, DROP COLUMN IF EXISTS offer_expires_at,
    DROP COLUMN IF EXISTS ended_at, DROP COLUMN IF EXISTS end_reason, DROP COLUMN IF EXISTS price_limit;
ALTER TABLE public.order_delivery_dispatches DROP CONSTRAINT IF EXISTS dispatches_price_adjustments_check;
ALTER TABLE public.order_delivery_dispatches
    DROP COLUMN IF EXISTS price_limit, DROP COLUMN IF EXISTS price_adjustments, DROP COLUMN IF EXISTS last_price_change_at,
    DROP COLUMN IF EXISTS offer_expires_at, DROP COLUMN IF EXISTS search_end_reason;

commit;
