-- Etapa 2.5 — BUSCA DINÂMICA V2: oferta inicial = estimativa, expansão de raio, aumento automático dentro do limite,
-- autorização do cliente acima do limite, aceite atômico com congelamento do frete integral. V2 continua DESLIGADO.
--
-- DECISÃO COMERCIAL: no V2 a plataforma NÃO desconta percentual do frete do motorista. platform_fee = 0 e driver_offer = final_freight
-- em toda rodada V2 (imposto por gatilho). O motorista recebe frozen_freight integral; o R$ 0,50 / plano R$ 100 seguem em
-- driver_postpaid_charges e subscriptions, que ESTA migration não toca.
--
-- Máquinas separadas por flow_version: V1 = process_order_delivery_dispatches (cron existente, só flow_version=1);
-- V2 = process_delivery_search_v2 (cron novo, cada entrega num sub-bloco: erro numa não derruba as outras).
--
-- Estado da busca V2 (order_delivery_dispatches): radius_km (raio vigente), final_freight (oferta atual), price_limit (maior valor
-- que a busca pode oferecer SEM perguntar; sobe só com autorização do cliente), price_adjustments (aumentos já feitos),
-- last_price_change_at, offer_expires_at (até quando a oferta vigente pode ser aceita), search_end_reason.

-- ============================================================
-- 1. Colunas
-- ============================================================
ALTER TABLE public.order_delivery_dispatches
    ADD COLUMN IF NOT EXISTS price_limit numeric,
    ADD COLUMN IF NOT EXISTS price_adjustments integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_price_change_at timestamptz,
    ADD COLUMN IF NOT EXISTS offer_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS search_end_reason text;
ALTER TABLE public.order_delivery_dispatches DROP CONSTRAINT IF EXISTS dispatches_price_adjustments_check;
ALTER TABLE public.order_delivery_dispatches ADD CONSTRAINT dispatches_price_adjustments_check CHECK (price_adjustments >= 0);

ALTER TABLE public.order_delivery_rounds
    ADD COLUMN IF NOT EXISTS strategy text,
    ADD COLUMN IF NOT EXISTS action text,
    ADD COLUMN IF NOT EXISTS automatic boolean,
    ADD COLUMN IF NOT EXISTS offer_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS ended_at timestamptz,
    ADD COLUMN IF NOT EXISTS end_reason text,
    ADD COLUMN IF NOT EXISTS price_limit numeric;
ALTER TABLE public.order_delivery_rounds DROP CONSTRAINT IF EXISTS order_delivery_rounds_kind_check;
ALTER TABLE public.order_delivery_rounds ADD CONSTRAINT order_delivery_rounds_kind_check
    CHECK (kind IN ('initial', 'increase', 'radius_only', 'driver_counter', 'hold'));
ALTER TABLE public.order_delivery_rounds DROP CONSTRAINT IF EXISTS order_delivery_rounds_status_check;
ALTER TABLE public.order_delivery_rounds ADD CONSTRAINT order_delivery_rounds_status_check
    CHECK (status IN ('authorized', 'pending_customer', 'declined', 'expired', 'radius_only', 'accepted'));
ALTER TABLE public.order_delivery_rounds DROP CONSTRAINT IF EXISTS order_delivery_rounds_action_check;
ALTER TABLE public.order_delivery_rounds ADD CONSTRAINT order_delivery_rounds_action_check
    CHECK (action IS NULL OR action IN ('initial', 'radius', 'price', 'radius_price', 'hold'));

-- fila de avisos agora também leva: nova rodada (motoristas) e pedido de autorização (cliente)
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_kind_check;
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_kind_check CHECK (kind IN (
    'tick', 'price_raised', 'delivered', 'round_started', 'reajust_requested',
    'phase_change', 'estimate_recorded', 'freight_frozen', 'driver_reserved', 'reservation_released',
    'payment_declared', 'cancelled', 'incident_opened', 'obligation_created', 'admin_decision',
    'reajust_decided', 'search_ended'
));
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_audit_processed_check;
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_audit_processed_check
    CHECK (kind IN ('tick', 'price_raised', 'delivered', 'round_started', 'reajust_requested') OR processed_at IS NOT NULL);

-- ============================================================
-- 2. Autorização de reajuste do cliente (≠ pagamento ≠ cobrança ≠ frete final: só libera um NOVO LIMITE de busca)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.delivery_reajust_authorizations (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id       uuid NOT NULL REFERENCES public.order_delivery_dispatches(id) ON DELETE CASCADE,
    round_id          uuid REFERENCES public.order_delivery_rounds(id) ON DELETE SET NULL,
    customer_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    estimated_freight numeric NOT NULL,
    current_offer     numeric NOT NULL,
    previous_limit    numeric NOT NULL,
    requested_limit   numeric NOT NULL,
    status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'declined', 'expired', 'cancelled')),
    requested_at      timestamptz NOT NULL DEFAULT now(),
    expires_at        timestamptz NOT NULL,
    decided_at        timestamptz,
    decided_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT dra_limit_check CHECK (requested_limit > previous_limit),
    CONSTRAINT dra_pending_check CHECK ((status = 'pending') = (decided_at IS NULL))
);
-- no máximo UM pedido pendente por entrega: o cron repetido não pergunta duas vezes
CREATE UNIQUE INDEX IF NOT EXISTS dra_one_pending ON public.delivery_reajust_authorizations (dispatch_id) WHERE status = 'pending';
ALTER TABLE public.delivery_reajust_authorizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dra_customer_select ON public.delivery_reajust_authorizations;
CREATE POLICY dra_customer_select ON public.delivery_reajust_authorizations FOR SELECT TO authenticated USING (customer_id = auth.uid());
REVOKE ALL ON public.delivery_reajust_authorizations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.delivery_reajust_authorizations TO authenticated;

-- os valores pedidos nunca mudam; só o desfecho (status/decided_*)
CREATE OR REPLACE FUNCTION public.dra_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF (to_jsonb(NEW) - 'status' - 'decided_at' - 'decided_by') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'decided_at' - 'decided_by')
       OR (OLD.status <> 'pending' AND NEW.status IS DISTINCT FROM OLD.status) THEN
        RAISE EXCEPTION 'A solicitação de autorização é histórica e não pode ser alterada' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS dra_no_edit ON public.delivery_reajust_authorizations;
CREATE TRIGGER dra_no_edit BEFORE UPDATE ON public.delivery_reajust_authorizations FOR EACH ROW EXECUTE FUNCTION public.dra_immutable();

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_reajust_authorizations;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'realtime publication: %', SQLERRM;
END $$;

-- ============================================================
-- 3. Cálculos da busca (puros, determinísticos, em centavos). Mesmo estado + mesmas configurações = mesma ação.
-- ============================================================
-- Limite automático (R$): quanto a oferta pode subir SEM perguntar. Desligado = só a estimativa. Mínimo dos limites aplicáveis.
CREATE OR REPLACE FUNCTION public._v2_auto_limit(p_estimated numeric, cfg public.delivery_dispatch_settings)
RETURNS numeric
LANGUAGE plpgsql STABLE
AS $$
DECLARE v numeric := p_estimated;
BEGIN
    IF cfg.auto_increase_enabled THEN
        v := cfg.max_freight;
        IF cfg.auto_increase_cap_amount IS NOT NULL THEN v := LEAST(v, p_estimated + cfg.auto_increase_cap_amount); END IF;
        IF cfg.auto_increase_cap_percent IS NOT NULL THEN v := LEAST(v, floor(p_estimated * (1 + cfg.auto_increase_cap_percent / 100) * 100) / 100); END IF;
    END IF;
    RETURN round(GREATEST(p_estimated, v), 2);
END;
$$;

-- Próximo valor da oferta: +fixo ou +% da oferta atual, arredondado no passo/modo do admin, sempre maior que o atual e nunca acima do teto.
CREATE OR REPLACE FUNCTION public._v2_next_price(p_current numeric, cfg public.delivery_dispatch_settings)
RETURNS numeric
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_c integer := round(p_current * 100)::integer;
    v_max integer := round(cfg.max_freight * 100)::integer;
    v_unit integer := GREATEST(1, round(cfg.freight_rounding_step * 100)::integer);
    v_step integer;
    v_new integer;
BEGIN
    IF v_c >= v_max THEN RETURN p_current; END IF;
    v_step := CASE cfg.increase_kind WHEN 'percent' THEN round(v_c * cfg.increase_value / 100)::integer ELSE round(cfg.increase_value * 100)::integer END;
    IF v_step <= 0 THEN RETURN p_current; END IF;
    v_new := public._freight_round_cents(v_c + v_step, v_unit, cfg.freight_rounding_mode);
    IF v_new <= v_c THEN v_new := v_c + v_unit; END IF;
    RETURN round(LEAST(v_new, v_max)::numeric / 100, 2);
END;
$$;

-- Até onde a busca chegaria se usasse TODOS os reajustes que ainda restam (é o "até R$ X" que se pede ao cliente)
CREATE OR REPLACE FUNCTION public._v2_projected_limit(p_current numeric, p_used integer, cfg public.delivery_dispatch_settings)
RETURNS numeric
LANGUAGE plpgsql STABLE
AS $$
DECLARE v numeric := p_current; n numeric; i integer;
BEGIN
    FOR i IN 1 .. GREATEST(0, cfg.max_price_adjustments - p_used) LOOP
        n := public._v2_next_price(v, cfg);
        EXIT WHEN n <= v;
        v := n;
    END LOOP;
    RETURN v;
END;
$$;

-- A decisão da próxima rodada. price_state: now (pode subir já) | wait (dentro do limite, mas o intervalo entre reajustes não passou)
-- | needs_auth (o próximo valor passa do limite autorizado) | none (sem reajustes/teto). Ações: radius | price | radius_price | hold | ask | end.
CREATE OR REPLACE FUNCTION public._v2_decide(d public.order_delivery_dispatches, cfg public.delivery_dispatch_settings)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_radius_ok boolean := d.radius_km < cfg.max_radius_km;
    v_new_radius numeric := LEAST(cfg.max_radius_km, d.radius_km + cfg.radius_step_km);
    v_next numeric := public._v2_next_price(d.final_freight, cfg);
    v_can_price boolean := d.price_adjustments < cfg.max_price_adjustments AND v_next > d.final_freight;
    v_interval_ok boolean := now() >= COALESCE(d.last_price_change_at, d.created_at) + make_interval(mins => cfg.price_adjust_interval_minutes);
    v_price text;
    v_action text;
BEGIN
    IF NOT v_can_price THEN v_price := 'none';
    ELSIF NOT v_interval_ok THEN v_price := 'wait';
    ELSIF v_next <= d.price_limit THEN v_price := 'now';
    ELSE v_price := 'needs_auth';
    END IF;

    IF cfg.search_strategy = 'EXPANDIR_RAIO_PRIMEIRO' THEN
        v_action := CASE WHEN v_radius_ok THEN 'radius' WHEN v_price = 'now' THEN 'price' WHEN v_price = 'wait' THEN 'hold'
                         WHEN v_price = 'needs_auth' THEN 'ask' ELSE 'end' END;
    ELSIF cfg.search_strategy = 'AUMENTAR_PRECO_PRIMEIRO' THEN
        v_action := CASE WHEN v_price = 'now' THEN 'price' WHEN v_price = 'wait' THEN 'hold' WHEN v_radius_ok THEN 'radius'
                         WHEN v_price = 'needs_auth' THEN 'ask' ELSE 'end' END;
    ELSE   -- RAIO_E_PRECO_SIMULTANEAMENTE
        v_action := CASE WHEN v_radius_ok AND v_price = 'now' THEN 'radius_price' WHEN v_radius_ok THEN 'radius' WHEN v_price = 'now' THEN 'price'
                         WHEN v_price = 'wait' THEN 'hold' WHEN v_price = 'needs_auth' THEN 'ask' ELSE 'end' END;
    END IF;
    RETURN jsonb_build_object('action', v_action, 'price_state', v_price, 'new_radius', v_new_radius, 'next_price', v_next);
END;
$$;

-- ============================================================
-- 4. Encerrar a busca sem motorista (SEM_ENTREGADOR). O resto (fechar rodada, cancelar autorização, evento) é do gatilho de fechamento.
-- ============================================================
CREATE OR REPLACE FUNCTION public._v2_end_search(p_dispatch uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE d public.order_delivery_dispatches;
BEGIN
    PERFORM set_config('app.delivery_actor', 'system', true);
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch FOR UPDATE;
    IF NOT FOUND OR d.status <> 'searching' THEN RETURN; END IF;
    UPDATE public.order_delivery_dispatches
       SET status = 'cancelled', phase = 'SEM_ENTREGADOR', search_end_reason = p_reason, offer_expires_at = NULL, updated_at = now()
     WHERE id = d.id;
    UPDATE public.ride_requests SET status = 'cancelled', cancelled_by = 'requester' WHERE id = d.ride_request_id AND status = 'pending';
END;
$$;

-- ============================================================
-- 5. O passo da busca de UMA entrega (idempotente: só age quando a janela da oferta venceu; a trava da linha impede repetição)
-- ============================================================
CREATE OR REPLACE FUNCTION public._advance_delivery_search_v2(p_dispatch uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    d public.order_delivery_dispatches;
    cfg public.delivery_dispatch_settings;
    a public.delivery_reajust_authorizations;
    dec jsonb;
    v_action text;
    v_ride_status text;
    v_price numeric;
    v_radius numeric;
    v_req numeric;
    v_auto boolean;
    v_by uuid;
    v_round uuid;
    v_expires timestamptz;
BEGIN
    PERFORM set_config('app.delivery_v2_engine', '1', true);
    PERFORM set_config('app.delivery_actor', 'system', true);
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch FOR UPDATE;
    IF NOT FOUND OR d.flow_version <> 2 OR d.status <> 'searching' THEN RETURN 'skip'; END IF;
    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;
    SELECT status INTO v_ride_status FROM public.ride_requests WHERE id = d.ride_request_id;
    IF v_ride_status IS DISTINCT FROM 'pending' THEN RETURN 'skip'; END IF;      -- aceita/cancelada: o gatilho de sincronização cuida

    IF now() >= d.created_at + make_interval(mins => cfg.max_search_minutes) THEN
        UPDATE public.delivery_reajust_authorizations SET status = 'expired', decided_at = now() WHERE dispatch_id = d.id AND status = 'pending' AND now() >= expires_at;
        PERFORM public._v2_end_search(d.id, 'timeout');
        RETURN 'ended:timeout';
    END IF;

    IF d.phase = 'AGUARDANDO_AUTORIZACAO_REAJUSTE' THEN
        SELECT * INTO a FROM public.delivery_reajust_authorizations WHERE dispatch_id = d.id AND status = 'pending';
        IF FOUND THEN
            IF now() >= a.expires_at THEN
                UPDATE public.delivery_reajust_authorizations SET status = 'expired', decided_at = now() WHERE id = a.id;
                PERFORM public._v2_end_search(d.id, 'authorization_expired');
                RETURN 'ended:authorization_expired';
            END IF;
            RETURN 'waiting';
        END IF;
        -- sem pedido pendente (estado inconsistente): volta a procurar sem inventar autorização
        UPDATE public.order_delivery_dispatches SET phase = 'PROCURANDO_ENTREGADOR', offer_expires_at = now(), updated_at = now() WHERE id = d.id;
        SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = d.id;
    END IF;

    IF d.offer_expires_at IS NOT NULL AND now() < d.offer_expires_at THEN RETURN 'open'; END IF;

    IF d.round >= cfg.max_rounds THEN
        PERFORM public._v2_end_search(d.id, 'max_rounds');
        RETURN 'ended:max_rounds';
    END IF;

    dec := public._v2_decide(d, cfg);
    v_action := dec->>'action';

    IF v_action = 'end' THEN
        PERFORM public._v2_end_search(d.id, 'exhausted');
        RETURN 'ended:exhausted';
    END IF;

    IF v_action = 'ask' THEN
        -- o próximo valor passa do limite automático: PARA e pergunta. O cliente autoriza um NOVO LIMITE, não paga nem fixa o frete.
        v_req := round(LEAST(cfg.max_freight, GREATEST(public._v2_projected_limit(d.final_freight, d.price_adjustments, cfg), (dec->>'next_price')::numeric)), 2);
        v_expires := now() + make_interval(mins => cfg.customer_authorization_timeout_minutes);
        SELECT id INTO v_round FROM public.order_delivery_rounds WHERE dispatch_id = d.id AND round = d.round;
        INSERT INTO public.delivery_reajust_authorizations (dispatch_id, round_id, customer_id, estimated_freight, current_offer, previous_limit, requested_limit, expires_at)
        VALUES (d.id, v_round, d.customer_id, COALESCE(d.estimated_freight, d.original_freight), d.final_freight, d.price_limit, v_req, v_expires);
        -- a oferta vigente (já autorizada) continua aceitável até o prazo da resposta; nada novo é oferecido
        UPDATE public.order_delivery_dispatches SET phase = 'AGUARDANDO_AUTORIZACAO_REAJUSTE', offer_expires_at = v_expires, updated_at = now() WHERE id = d.id;
        INSERT INTO public.order_delivery_events (dispatch_id, kind, round_id, data)
        VALUES (d.id, 'reajust_requested', v_round, jsonb_build_object('previous_limit', d.price_limit, 'requested_limit', v_req, 'current_offer', d.final_freight));
        RETURN 'asked';
    END IF;

    -- nova rodada: radius | price | radius_price | hold
    v_price := CASE WHEN v_action IN ('price', 'radius_price') THEN (dec->>'next_price')::numeric ELSE d.final_freight END;
    v_radius := CASE WHEN v_action IN ('radius', 'radius_price') THEN (dec->>'new_radius')::numeric ELSE d.radius_km END;
    v_auto := v_price <= public._v2_auto_limit(COALESCE(d.estimated_freight, d.original_freight), cfg);
    v_expires := now() + make_interval(secs => cfg.offer_duration_seconds);
    IF NOT v_auto THEN
        SELECT decided_by INTO v_by FROM public.delivery_reajust_authorizations WHERE dispatch_id = d.id AND status = 'authorized' ORDER BY decided_at DESC LIMIT 1;
    END IF;

    UPDATE public.order_delivery_rounds SET status = 'expired', ended_at = now(), end_reason = 'no_taker' WHERE dispatch_id = d.id AND round = d.round AND ended_at IS NULL;
    INSERT INTO public.order_delivery_rounds (dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status,
                                              authorized_at, authorized_by, strategy, action, automatic, offer_expires_at, price_limit)
    VALUES (d.id, d.round + 1, CASE v_action WHEN 'hold' THEN 'hold' WHEN 'radius' THEN 'radius_only' ELSE 'increase' END,
            d.original_freight, v_price - d.original_freight, v_price, 0, v_price, v_radius, 'authorized',
            now(), CASE WHEN v_auto THEN NULL ELSE v_by END, cfg.search_strategy, v_action, v_auto, v_expires, d.price_limit)
    RETURNING id INTO v_round;

    UPDATE public.order_delivery_dispatches
       SET round = d.round + 1, radius_km = v_radius, final_freight = v_price,
           price_adjustments = d.price_adjustments + CASE WHEN v_action IN ('price', 'radius_price') THEN 1 ELSE 0 END,
           last_price_change_at = CASE WHEN v_action IN ('price', 'radius_price') THEN now() ELSE d.last_price_change_at END,
           round_started_at = now(), offer_expires_at = v_expires, updated_at = now()
     WHERE id = d.id;

    INSERT INTO public.order_delivery_events (dispatch_id, kind, old_radius, new_radius, round_id, data, processed_at)
    VALUES (d.id, 'round_started', d.radius_km, v_radius, v_round,
            jsonb_build_object('action', v_action, 'round', d.round + 1, 'price', v_price, 'price_changed', v_price <> d.final_freight, 'radius_changed', v_radius <> d.radius_km),
            CASE WHEN v_action = 'hold' THEN now() END);       -- "manter" só audita; as demais entram na fila de avisos aos motoristas
    RETURN 'round:' || v_action;
END;
$$;

-- Job do V2: cada entrega num sub-bloco (erro numa não derruba as outras). O V1 continua em process_order_delivery_dispatches.
CREATE OR REPLACE FUNCTION public.process_delivery_search_v2()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; v_res text; v_n integer := 0;
BEGIN
    FOR r IN
        SELECT id FROM public.order_delivery_dispatches
         WHERE flow_version = 2 AND status = 'searching'
           AND (offer_expires_at IS NULL OR offer_expires_at <= now() OR phase = 'AGUARDANDO_AUTORIZACAO_REAJUSTE')
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            v_res := public._advance_delivery_search_v2(r.id);
            IF v_res LIKE 'round:%' OR v_res LIKE 'ended:%' OR v_res = 'asked' THEN v_n := v_n + 1; END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'busca V2 falhou na entrega %: %', r.id, SQLERRM;
        END;
    END LOOP;
    IF v_n > 0 THEN PERFORM public._ping_delivery_events(); END IF;
    RETURN v_n;
END;
$$;

-- ============================================================
-- 6. Resposta do cliente ao pedido de autorização
-- ============================================================
CREATE OR REPLACE FUNCTION public.respond_delivery_reajust(p_authorization uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    a public.delivery_reajust_authorizations;
    d public.order_delivery_dispatches;
    v_dispatch uuid;
BEGIN
    SELECT dispatch_id INTO v_dispatch FROM public.delivery_reajust_authorizations WHERE id = p_authorization;
    -- trava primeiro a entrega (mesma ordem do cron) para não travar em círculo
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = v_dispatch FOR UPDATE;
    IF NOT FOUND OR d.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO a FROM public.delivery_reajust_authorizations WHERE id = p_authorization FOR UPDATE;
    IF a.status <> 'pending' THEN RAISE EXCEPTION 'Essa solicitação não está mais disponível' USING HINT = 'reajust_closed'; END IF;
    IF d.status <> 'searching' THEN
        UPDATE public.delivery_reajust_authorizations SET status = 'cancelled', decided_at = now() WHERE id = a.id;
        RAISE EXCEPTION 'A entrega já não está em busca' USING HINT = 'not_searching';
    END IF;
    IF now() >= a.expires_at THEN
        UPDATE public.delivery_reajust_authorizations SET status = 'expired', decided_at = now() WHERE id = a.id;
        PERFORM public._v2_end_search(d.id, 'authorization_expired');
        RETURN jsonb_build_object('accepted', false, 'expired', true);
    END IF;

    IF NOT p_accept THEN
        UPDATE public.delivery_reajust_authorizations SET status = 'declined', decided_at = now(), decided_by = auth.uid() WHERE id = a.id;
        INSERT INTO public.order_delivery_events (dispatch_id, kind, actor_id, actor_role, data, processed_at)
        VALUES (d.id, 'reajust_decided', auth.uid(), 'customer', jsonb_build_object('authorization_id', a.id, 'accepted', false, 'previous_limit', a.previous_limit, 'requested_limit', a.requested_limit), now());
        PERFORM public._v2_end_search(d.id, 'customer_declined');
        RETURN jsonb_build_object('accepted', false);
    END IF;

    PERFORM set_config('app.delivery_actor', 'customer', true);
    UPDATE public.delivery_reajust_authorizations SET status = 'authorized', decided_at = now(), decided_by = auth.uid() WHERE id = a.id;
    UPDATE public.order_delivery_dispatches
       SET price_limit = a.requested_limit, phase = 'PROCURANDO_ENTREGADOR', offer_expires_at = now(), updated_at = now()
     WHERE id = d.id;
    INSERT INTO public.order_delivery_events (dispatch_id, kind, actor_id, actor_role, data, processed_at)
    VALUES (d.id, 'reajust_decided', auth.uid(), 'customer', jsonb_build_object('authorization_id', a.id, 'accepted', true, 'previous_limit', a.previous_limit, 'requested_limit', a.requested_limit), now());
    PERFORM public._advance_delivery_search_v2(d.id);      -- retoma já, sem esperar o próximo minuto do cron
    PERFORM public._ping_delivery_events();
    RETURN jsonb_build_object('accepted', true, 'price_limit', a.requested_limit);
END;
$$;

-- ============================================================
-- 7. Aceite do motorista: validação atômica (trava a entrega; serializa com o cron e com os outros aceites)
-- ============================================================
CREATE OR REPLACE FUNCTION public.ride_applications_v2_gate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE d public.order_delivery_dispatches; v_status text; v_price numeric;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = NEW.ride_request_id AND flow_version = 2 FOR UPDATE;
    IF NOT FOUND THEN RETURN NEW; END IF;                       -- entrega V1: nada muda
    IF d.status <> 'searching' THEN RETURN NEW; END IF;         -- já decidida: os gatilhos existentes rejeitam a candidatura
    SELECT status, offered_price INTO v_status, v_price FROM public.ride_requests WHERE id = NEW.ride_request_id;
    IF v_status IS DISTINCT FROM 'pending' THEN RETURN NEW; END IF;
    IF d.offer_expires_at IS NULL OR now() >= d.offer_expires_at THEN
        RAISE EXCEPTION 'Esta oferta expirou' USING ERRCODE = '42501', HINT = 'offer_expired';
    END IF;
    IF NEW.proposed_price IS DISTINCT FROM d.final_freight OR v_price IS DISTINCT FROM d.final_freight THEN
        RAISE EXCEPTION 'O valor da oferta mudou. Veja o valor atual.' USING ERRCODE = '42501', HINT = 'offer_changed';
    END IF;
    IF d.price_limit IS NULL OR d.final_freight > d.price_limit THEN
        RAISE EXCEPTION 'Valor acima do autorizado pelo cliente' USING ERRCODE = '42501', HINT = 'above_authorized';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ride_applications_v2_gate ON public.ride_applications;
CREATE TRIGGER ride_applications_v2_gate BEFORE INSERT ON public.ride_applications FOR EACH ROW EXECUTE FUNCTION public.ride_applications_v2_gate();

-- ============================================================
-- 8. Gatilhos de apoio do V2
-- ============================================================
-- (a) oferta atual (final_freight) e raio são a verdade; o que o motorista vê (offered_price, visible_radius_km) é só o espelho, sem desconto
CREATE OR REPLACE FUNCTION public.dispatch_v2_sync_ride()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.flow_version = 2 AND NEW.status = 'searching'
       AND (NEW.final_freight IS DISTINCT FROM OLD.final_freight OR NEW.radius_km IS DISTINCT FROM OLD.radius_km) THEN
        UPDATE public.ride_requests SET offered_price = NEW.final_freight, visible_radius_km = NEW.radius_km
         WHERE id = NEW.ride_request_id AND status = 'pending'
           AND (offered_price IS DISTINCT FROM NEW.final_freight OR visible_radius_km IS DISTINCT FROM NEW.radius_km);
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS order_delivery_dispatches_v2_sync_ride ON public.order_delivery_dispatches;
CREATE TRIGGER order_delivery_dispatches_v2_sync_ride AFTER UPDATE ON public.order_delivery_dispatches FOR EACH ROW EXECUTE FUNCTION public.dispatch_v2_sync_ride();

-- (b) a busca terminou (motorista aceitou, cancelada ou sem entregador): fecha a rodada, cancela autorização pendente, registra o motivo
CREATE OR REPLACE FUNCTION public.dispatch_v2_closed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_reason text;
BEGIN
    IF NEW.flow_version = 2 AND OLD.status = 'searching' AND NEW.status <> 'searching' THEN
        v_reason := COALESCE(NEW.search_end_reason, CASE NEW.status WHEN 'accepted' THEN 'driver_accepted' ELSE 'cancelled' END);
        UPDATE public.order_delivery_rounds
           SET status = CASE WHEN NEW.status = 'accepted' THEN 'accepted' ELSE 'expired' END, ended_at = now(), end_reason = v_reason
         WHERE dispatch_id = NEW.id AND round = NEW.round AND ended_at IS NULL;
        UPDATE public.delivery_reajust_authorizations SET status = 'cancelled', decided_at = now() WHERE dispatch_id = NEW.id AND status = 'pending';
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_from, phase_to, data, processed_at)
        VALUES (NEW.id, 'search_ended', OLD.phase, NEW.phase,
                jsonb_build_object('reason', v_reason, 'round', NEW.round, 'final_freight', NEW.final_freight, 'frozen_freight', NEW.frozen_freight), now());
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS order_delivery_dispatches_v2_closed ON public.order_delivery_dispatches;
CREATE TRIGGER order_delivery_dispatches_v2_closed AFTER UPDATE ON public.order_delivery_dispatches FOR EACH ROW EXECUTE FUNCTION public.dispatch_v2_closed();

-- (c) rodadas V2: só o motor cria as que não são 'initial'; motorista recebe o frete INTEGRAL (taxa da plataforma sobre o frete = 0)
CREATE OR REPLACE FUNCTION public.delivery_rounds_v2_fence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.order_delivery_dispatches d WHERE d.id = NEW.dispatch_id AND d.flow_version = 2) THEN
        IF NEW.kind <> 'initial' AND COALESCE(current_setting('app.delivery_v2_engine', true), '') <> '1' THEN
            RAISE EXCEPTION 'As rodadas do novo fluxo só são criadas pela busca automática' USING ERRCODE = '42501';
        END IF;
        IF NEW.platform_fee <> 0 OR NEW.driver_offer <> NEW.final_freight THEN
            RAISE EXCEPTION 'No novo fluxo o motorista recebe o frete integral (sem taxa sobre o frete)' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- (d) testes/rotinas podem pedir para não disparar o aviso (pg_net) enquanto gravam eventos
CREATE OR REPLACE FUNCTION public._ping_delivery_events()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_url text;
BEGIN
    IF COALESCE(current_setting('app.skip_delivery_ping', true), '') = '1' THEN RETURN; END IF;
    SELECT notify_url INTO v_url FROM public.delivery_dispatch_settings WHERE id;
    IF v_url IS NOT NULL AND v_url <> '' THEN
        PERFORM net.http_post(url := v_url, body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'delivery events ping failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 9. Permissões e job
-- ============================================================
REVOKE ALL ON FUNCTION public._v2_auto_limit(numeric, public.delivery_dispatch_settings) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._v2_next_price(numeric, public.delivery_dispatch_settings) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._v2_projected_limit(numeric, integer, public.delivery_dispatch_settings) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._v2_decide(public.order_delivery_dispatches, public.delivery_dispatch_settings) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._v2_end_search(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._advance_delivery_search_v2(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_delivery_search_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_delivery_reajust(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_delivery_reajust(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.ride_applications_v2_gate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_v2_sync_ride() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_v2_closed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dra_immutable() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'order-delivery-v2-tick';
SELECT cron.schedule('order-delivery-v2-tick', '* * * * *', 'SELECT public.process_delivery_search_v2()');


-- ============================================================
-- 10. Funções existentes ajustadas (V1 igual; V2 com as regras novas)
-- ============================================================
-- manutenção da fase: V2 avança sozinha quando o motorista aceita (→ ENTREGADOR_RESERVADO) ou o cliente cancela (→ CANCELADO)
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
        -- a oferta nunca passa do limite que o cliente autorizou (nem do teto)
        IF NEW.price_limit IS NOT NULL AND NEW.final_freight > NEW.price_limit THEN
            RAISE EXCEPTION 'A oferta não pode passar do limite autorizado pelo cliente' USING ERRCODE = '42501';
        END IF;
        -- a busca terminou por fora do motor (motorista aceitou ou cliente cancelou): a fase acompanha
        IF TG_OP = 'UPDATE' AND OLD.status = 'searching' AND NEW.phase = OLD.phase
           AND OLD.phase IN ('PROCURANDO_ENTREGADOR', 'AGUARDANDO_AUTORIZACAO_REAJUSTE') THEN
            IF NEW.status = 'accepted' THEN
                NEW.phase := 'ENTREGADOR_RESERVADO';      -- motorista definido; a reserva operacional/pagamento é a próxima etapa
                NEW.phase_changed_at := now();
                NEW.offer_expires_at := NULL;
                NEW.search_end_reason := COALESCE(NEW.search_end_reason, 'driver_accepted');
            ELSIF NEW.status = 'cancelled' THEN
                NEW.phase := 'CANCELADO';
                NEW.phase_changed_at := now();
                NEW.offer_expires_at := NULL;
                NEW.search_end_reason := COALESCE(NEW.search_end_reason, 'cancelled');
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- "Minha tarifa" (contraproposta do motorista): DESATIVADA no V2 nesta etapa; V1 igual
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
    IF d.flow_version = 2 THEN
        RAISE EXCEPTION 'A contraproposta ("Minha tarifa") ainda não está disponível no novo fluxo de entregas' USING ERRCODE = '42501';
    END IF;
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

-- criação da entrega: V2 nasce com limite automático, janela da oferta, taxa 0 e a rodada 1 na fila de avisos
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
    v_round uuid;
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
    -- V2: a plataforma NÃO desconta percentual do frete do motorista (decisão comercial); V1 segue a configuração
    v_platform := CASE WHEN v_v2 THEN 0 ELSE round(v_fee * cfg.platform_fee_percent / 100, 2) END;

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
                                                      flow_version, phase, estimated_freight, estimate_id,
                                                      price_limit, last_price_change_at, offer_expires_at)
        VALUES (o.id, v_ride, s.id, o.buyer_id, v_fee, v_fee, cfg.initial_radius_km,
                2, 'PROCURANDO_ENTREGADOR', est.estimated_freight, est.id,
                public._v2_auto_limit(est.estimated_freight, cfg), now(), now() + make_interval(secs => cfg.offer_duration_seconds))
        RETURNING id INTO v_dispatch;
    ELSE
        INSERT INTO public.order_delivery_dispatches (order_id, ride_request_id, store_id, customer_id, original_freight, final_freight, radius_km)
        VALUES (o.id, v_ride, s.id, o.buyer_id, v_fee, v_fee, cfg.initial_radius_km)
        RETURNING id INTO v_dispatch;
    END IF;

    IF v_v2 THEN
        -- rodada 1 = a estimativa que o cliente viu ao enviar o pedido, no raio inicial; os motoristas são avisados pela fila
        INSERT INTO public.order_delivery_rounds (dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status,
                                                  authorized_at, authorized_by, strategy, action, automatic, offer_expires_at, price_limit)
        VALUES (v_dispatch, 1, 'initial', v_fee, 0, v_fee, 0, v_fee, cfg.initial_radius_km, 'authorized', now(), o.buyer_id,
                cfg.search_strategy, 'initial', true, now() + make_interval(secs => cfg.offer_duration_seconds), public._v2_auto_limit(est.estimated_freight, cfg))
        RETURNING id INTO v_round;
        INSERT INTO public.order_delivery_events (dispatch_id, kind, old_radius, new_radius, round_id, data)
        VALUES (v_dispatch, 'round_started', NULL, cfg.initial_radius_km, v_round,
                jsonb_build_object('action', 'initial', 'round', 1, 'price', v_fee, 'price_changed', true, 'radius_changed', true));
        PERFORM public._ping_delivery_events();
    ELSE
        INSERT INTO public.order_delivery_rounds (dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status, authorized_at, authorized_by)
        VALUES (v_dispatch, 1, 'initial', v_fee, 0, v_fee, v_platform, v_fee - v_platform, cfg.initial_radius_km, 'authorized', now(), o.buyer_id);
    END IF;

    RETURN v_dispatch;
END;
$function$;
