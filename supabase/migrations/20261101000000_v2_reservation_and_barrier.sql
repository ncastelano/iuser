-- Etapa 2.6 — RESERVA DO MOTORISTA, TOTAL DEFINITIVO E BARREIRA OPERACIONAL ANTES DO PAGAMENTO (V2 continua DESLIGADO).
--
-- Depois que um motorista aceita uma entrega V2:
--   aceite → frozen_freight = oferta vigente → ENTREGADOR_RESERVADO (transitória, na mesma transação) → AGUARDANDO_PAGAMENTO_CLIENTE.
--   reserved_at / reserved_until (reservation_timeout_minutes do admin) valem para o motorista vencedor (ride_requests.driver_id).
--   O pedido (orders.delivery_fee / total_amount) passa a mostrar o TOTAL DEFINITIVO = produtos − descontos + frozen_freight, calculado aqui.
--   O motorista NÃO avança nada operacional (ir à loja, chegar, iniciar, concluir) enquanto a fase não for ENTREGA_LIBERADA ou posterior:
--   barreira em gatilho da tabela ride_requests (vale para tela, API, RPC e chamada direta). Só flow_version = 2; o V1 não muda.
--   Reserva vencida → reservation_expiry_action (voltar à busca com nova rodada, ou encerrar). Motorista que cancela a reserva = liberação.
--
-- Frete congelado e a volta à busca: frozen_freight é "o frete aceito por UM motorista". Se esse motorista é liberado, o campo volta a NULL
-- (invariante da 2.4.1: NULL até haver um motorista aceito) e a história do aceite fica em order_delivery_events ('freight_frozen' com o valor,
-- 'driver_reserved' com o motorista, 'reservation_released' com motivo e o valor liberado) e na rodada que foi aceita. Nada de campo duplicado.

-- ============================================================
-- 1. Dados
-- ============================================================
INSERT INTO public.delivery_phase_transitions (from_phase, to_phase, actor_role)
SELECT 'ENTREGADOR_RESERVADO', 'CANCELADO', 'system'
WHERE NOT EXISTS (SELECT 1 FROM public.delivery_phase_transitions WHERE from_phase = 'ENTREGADOR_RESERVADO' AND to_phase = 'CANCELADO' AND actor_role = 'system');

ALTER TABLE public.order_delivery_rounds DROP CONSTRAINT IF EXISTS order_delivery_rounds_action_check;
ALTER TABLE public.order_delivery_rounds ADD CONSTRAINT order_delivery_rounds_action_check
    CHECK (action IS NULL OR action IN ('initial', 'radius', 'price', 'radius_price', 'hold', 'reopen'));

ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_kind_check;
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_kind_check CHECK (kind IN (
    'tick', 'price_raised', 'delivered', 'round_started', 'reajust_requested', 'reservation_notice',
    'phase_change', 'estimate_recorded', 'freight_frozen', 'driver_reserved', 'reservation_released',
    'payment_declared', 'cancelled', 'incident_opened', 'obligation_created', 'admin_decision',
    'reajust_decided', 'search_ended'
));
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_audit_processed_check;
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_audit_processed_check
    CHECK (kind IN ('tick', 'price_raised', 'delivered', 'round_started', 'reajust_requested', 'reservation_notice') OR processed_at IS NOT NULL);

-- ============================================================
-- 2. Auxiliares
-- ============================================================
-- fases em que a entrega está LIBERADA para o motorista andar (qualquer outra bloqueia o avanço operacional)
CREATE OR REPLACE FUNCTION public._v2_phase_released(p_phase text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$ SELECT p_phase IN ('ENTREGA_LIBERADA', 'A_CAMINHO_DA_LOJA', 'CHEGOU_NA_LOJA', 'PEDIDO_RETIRADO', 'A_CAMINHO_DO_CLIENTE', 'ENTREGUE', 'CONCLUIDO') $$;

CREATE OR REPLACE FUNCTION public._v2_state_code(p_phase text, p_status text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_phase = 'PROCURANDO_ENTREGADOR' THEN 'searching'
        WHEN p_phase = 'AGUARDANDO_AUTORIZACAO_REAJUSTE' THEN 'awaiting_authorization'
        WHEN p_phase = 'ENTREGADOR_RESERVADO' THEN 'driver_reserved'
        WHEN p_phase = 'AGUARDANDO_PAGAMENTO_CLIENTE' THEN 'awaiting_payment'
        WHEN p_phase = 'SEM_ENTREGADOR' THEN 'no_driver'
        WHEN p_phase = 'CANCELADO' THEN 'cancelled'
        WHEN public._v2_phase_released(p_phase) THEN 'released'
        ELSE lower(p_phase)
    END
$$;

-- o pedido mostra o frete vigente: estimado enquanto busca; DEFINITIVO (frozen_freight) com motorista reservado. Total = o resto do pedido + frete.
CREATE OR REPLACE FUNCTION public._v2_set_order_freight(p_order uuid, p_fee numeric)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
    UPDATE public.orders SET total_amount = total_amount - COALESCE(delivery_fee, 0) + p_fee, delivery_fee = p_fee WHERE id = p_order
$$;

-- ============================================================
-- 3. Liberar a reserva (voltar à busca ou encerrar). Idempotente: só age numa reserva ativa.
-- ============================================================
CREATE OR REPLACE FUNCTION public._v2_release_reservation(p_dispatch uuid, p_reason text, p_mode text, p_skip_ride boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    d public.order_delivery_dispatches;
    cfg public.delivery_dispatch_settings;
    v_driver uuid;
    v_round uuid;
    v_expires timestamptz;
BEGIN
    PERFORM set_config('app.delivery_actor', 'system', true);
    PERFORM set_config('app.delivery_v2_engine', '1', true);
    PERFORM set_config('app.delivery_v2_release', '1', true);
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch FOR UPDATE;
    IF NOT FOUND OR d.flow_version <> 2 OR d.status <> 'accepted' OR d.reserved_at IS NULL OR d.reservation_released_at IS NOT NULL
       OR d.phase NOT IN ('ENTREGADOR_RESERVADO', 'AGUARDANDO_PAGAMENTO_CLIENTE') THEN
        PERFORM set_config('app.delivery_v2_release', '', true);
        RETURN false;                                           -- já liberada / não está reservada: repetir não faz nada
    END IF;
    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;
    SELECT driver_id INTO v_driver FROM public.ride_requests WHERE id = d.ride_request_id;

    IF p_mode = 'reopen' THEN
        v_expires := now() + make_interval(secs => cfg.offer_duration_seconds);
        -- frozen_freight volta a NULL: não pode ser confundido com o frete definitivo de um motorista futuro (a história fica nos eventos)
        UPDATE public.order_delivery_dispatches
           SET status = 'searching', stage = 'searching', phase = 'PROCURANDO_ENTREGADOR', frozen_freight = NULL, freight_frozen_at = NULL,
               reservation_released_at = now(), reservation_release_reason = p_reason, search_end_reason = NULL,
               round = d.round + 1, round_started_at = now(), offer_expires_at = v_expires, updated_at = now()
         WHERE id = d.id;
        INSERT INTO public.order_delivery_rounds (dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status,
                                                  authorized_at, strategy, action, automatic, offer_expires_at, price_limit)
        VALUES (d.id, d.round + 1, 'hold', d.original_freight, d.final_freight - d.original_freight, d.final_freight, 0, d.final_freight, d.radius_km, 'authorized',
                now(), cfg.search_strategy, 'reopen', true, v_expires, d.price_limit)
        RETURNING id INTO v_round;
        PERFORM public._v2_set_order_freight(d.order_id, COALESCE(d.estimated_freight, d.original_freight));
        IF NOT p_skip_ride THEN
            UPDATE public.ride_requests SET status = 'pending', driver_id = NULL, cancelled_by = NULL, share_closed_at = NULL
             WHERE id = d.ride_request_id AND status IN ('accepted', 'cancelled');
        END IF;
        -- quem perdeu a disputa pelo aceite (rejeitado só porque a corrida fechou) volta a poder aceitar a nova oferta
        DELETE FROM public.ride_applications WHERE ride_request_id = d.ride_request_id AND status = 'rejected' AND applicant_id IS DISTINCT FROM v_driver;
        IF v_driver IS NOT NULL THEN
            IF p_reason = 'driver_cancelled' THEN
                UPDATE public.ride_applications SET status = 'rejected' WHERE ride_request_id = d.ride_request_id AND applicant_id = v_driver;
            ELSE
                DELETE FROM public.ride_applications WHERE ride_request_id = d.ride_request_id AND applicant_id = v_driver;   -- não foi culpa dele: pode aceitar de novo
            END IF;
        END IF;
        INSERT INTO public.order_delivery_events (dispatch_id, kind, old_radius, new_radius, round_id, data)
        VALUES (d.id, 'round_started', d.radius_km, d.radius_km, v_round,
                jsonb_build_object('action', 'reopen', 'round', d.round + 1, 'price', d.final_freight, 'price_changed', true, 'radius_changed', true));
    ELSE
        UPDATE public.order_delivery_dispatches
           SET status = 'cancelled', phase = 'CANCELADO', reservation_released_at = now(), reservation_release_reason = p_reason,
               search_end_reason = p_reason, offer_expires_at = NULL, updated_at = now()
         WHERE id = d.id;
        PERFORM public._v2_set_order_freight(d.order_id, COALESCE(d.estimated_freight, d.original_freight));
        IF NOT p_skip_ride THEN
            UPDATE public.ride_requests SET status = 'cancelled', cancelled_by = 'requester' WHERE id = d.ride_request_id AND status = 'accepted';
        END IF;
    END IF;

    INSERT INTO public.order_delivery_events (dispatch_id, kind, data)
    VALUES (d.id, 'reservation_notice', jsonb_build_object('reason', p_reason, 'mode', p_mode, 'driver_id', v_driver, 'released_frozen_freight', d.frozen_freight));
    PERFORM set_config('app.delivery_v2_release', '', true);      -- a marca vale só durante a liberação (a transação pode continuar)
    PERFORM public._ping_delivery_events();
    RETURN true;
END;
$$;

-- reserva vencida: executa a ação do admin (voltar à busca ou encerrar). Sem tempo de busca sobrando, encerra como SEM_ENTREGADOR.
CREATE OR REPLACE FUNCTION public._v2_expire_reservation(p_dispatch uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE d public.order_delivery_dispatches; cfg public.delivery_dispatch_settings; v_ok boolean;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch FOR UPDATE;
    IF NOT FOUND OR d.flow_version <> 2 OR d.status <> 'accepted' OR d.reservation_released_at IS NOT NULL OR d.reserved_until IS NULL OR now() < d.reserved_until THEN
        RETURN 'skip';
    END IF;
    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;
    IF cfg.reservation_expiry_action = 'CANCEL_DELIVERY' THEN
        v_ok := public._v2_release_reservation(d.id, 'customer_timeout', 'cancel');
        RETURN CASE WHEN v_ok THEN 'expired:cancelled' ELSE 'skip' END;
    END IF;
    v_ok := public._v2_release_reservation(d.id, 'customer_timeout', 'reopen');
    IF v_ok AND now() >= d.created_at + make_interval(mins => cfg.max_search_minutes) THEN
        PERFORM public._v2_end_search(d.id, 'timeout');
        RETURN 'expired:no_driver';
    END IF;
    RETURN CASE WHEN v_ok THEN 'expired:reopened' ELSE 'skip' END;
END;
$$;

-- ============================================================
-- 4. Job: busca (2.5) + reservas vencidas, cada uma num sub-bloco
-- ============================================================
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
    FOR r IN
        SELECT id FROM public.order_delivery_dispatches
         WHERE flow_version = 2 AND status = 'accepted' AND reserved_until <= now() AND reservation_released_at IS NULL
           AND phase IN ('ENTREGADOR_RESERVADO', 'AGUARDANDO_PAGAMENTO_CLIENTE')
         ORDER BY reserved_until
         FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            v_res := public._v2_expire_reservation(r.id);
            IF v_res LIKE 'expired:%' THEN v_n := v_n + 1; END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'reserva V2 falhou na entrega %: %', r.id, SQLERRM;
        END;
    END LOOP;
    IF v_n > 0 THEN PERFORM public._ping_delivery_events(); END IF;
    RETURN v_n;
END;
$$;

-- ============================================================
-- 5. Gatilhos
-- ============================================================
-- (a) reserva pronta → total definitivo no pedido → AGUARDANDO_PAGAMENTO_CLIENTE (ENTREGADOR_RESERVADO é transitória: dura a transação)
CREATE OR REPLACE FUNCTION public.dispatch_v2_reserved()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.flow_version = 2 AND NEW.phase = 'ENTREGADOR_RESERVADO' AND OLD.phase IS DISTINCT FROM NEW.phase AND NEW.frozen_freight IS NOT NULL THEN
        PERFORM public._v2_set_order_freight(NEW.order_id, NEW.frozen_freight);       -- produtos − descontos + frete aceito, no servidor
        INSERT INTO public.order_delivery_events (dispatch_id, kind, data)
        VALUES (NEW.id, 'reservation_notice', jsonb_build_object('reason', 'reserved', 'frozen_freight', NEW.frozen_freight, 'reserved_until', NEW.reserved_until,
                                                                  'driver_id', (SELECT driver_id FROM public.ride_requests WHERE id = NEW.ride_request_id)));
        PERFORM set_config('app.delivery_actor', 'system', true);
        UPDATE public.order_delivery_dispatches SET phase = 'AGUARDANDO_PAGAMENTO_CLIENTE' WHERE id = NEW.id;
        PERFORM public._ping_delivery_events();
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS order_delivery_dispatches_v2_reserved ON public.order_delivery_dispatches;
CREATE TRIGGER order_delivery_dispatches_v2_reserved AFTER UPDATE ON public.order_delivery_dispatches FOR EACH ROW EXECUTE FUNCTION public.dispatch_v2_reserved();

-- (b) a busca terminou sem motorista: aviso ao cliente e à loja (o pedido continua com o status dele; ver get_order_delivery_view)
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
        IF NEW.phase = 'SEM_ENTREGADOR' THEN
            INSERT INTO public.order_delivery_events (dispatch_id, kind, data) VALUES (NEW.id, 'reservation_notice', jsonb_build_object('reason', 'no_driver', 'detail', v_reason));
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

-- (c) BARREIRA: nenhum avanço operacional de entrega V2 antes de ENTREGA_LIBERADA; cancelamento durante a reserva vira liberação
CREATE OR REPLACE FUNCTION public.ride_requests_v2_barrier()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE d record; v_reserved boolean; v_allowed boolean;
BEGIN
    IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
    SELECT id, phase, status INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = NEW.id AND flow_version = 2;
    IF NOT FOUND THEN RETURN NEW; END IF;                        -- V1 e corridas comuns: nada muda
    v_reserved := d.status = 'accepted' AND d.phase IN ('ENTREGADOR_RESERVADO', 'AGUARDANDO_PAGAMENTO_CLIENTE');

    IF v_reserved AND OLD.status = 'accepted' AND NEW.status = 'cancelled' THEN
        IF NEW.cancelled_by = 'driver' THEN
            SELECT cancel_driver_after_reservation INTO v_allowed FROM public.delivery_dispatch_settings WHERE id;
            IF NOT v_allowed THEN
                RAISE EXCEPTION 'O entregador não pode cancelar depois da reserva' USING ERRCODE = '42501', HINT = 'cancel_not_allowed';
            END IF;
        END IF;
        RETURN NEW;                                              -- a liberação é feita pelo gatilho DEPOIS (a política de segurança confere a linha final)
    END IF;

    IF NOT public._v2_phase_released(d.phase)
       AND ((NEW.driver_en_route, NEW.driver_departed_at, NEW.driver_arrived_at, NEW.ride_started_at, NEW.stop1_reached_at, NEW.stop2_reached_at,
             NEW.extra_task_minutes, NEW.extra_task_fee, NEW.extra_task_description)
            IS DISTINCT FROM
            (OLD.driver_en_route, OLD.driver_departed_at, OLD.driver_arrived_at, OLD.ride_started_at, OLD.stop1_reached_at, OLD.stop2_reached_at,
             OLD.extra_task_minutes, OLD.extra_task_fee, OLD.extra_task_description)
            OR (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')) THEN
        RAISE EXCEPTION 'Aguarde a liberação da entrega antes de iniciar a retirada' USING ERRCODE = '42501', HINT = 'delivery_not_released';
    END IF;
    RETURN NEW;
END;
$$;
-- cancelamento da corrida durante a reserva: motorista cancela → a entrega volta à busca e o motorista sai; loja cancela → entrega cancelada
CREATE OR REPLACE FUNCTION public.ride_requests_v2_after_cancel()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE d record;
BEGIN
    IF NEW.order_id IS NOT NULL AND OLD.status = 'accepted' AND NEW.status = 'cancelled' THEN
        SELECT id, phase, status INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = NEW.id AND flow_version = 2;
        IF FOUND AND d.status = 'accepted' AND d.phase IN ('ENTREGADOR_RESERVADO', 'AGUARDANDO_PAGAMENTO_CLIENTE') THEN
            IF NEW.cancelled_by = 'driver' THEN
                PERFORM public._v2_release_reservation(d.id, 'driver_cancelled', 'reopen', false);
            ELSE
                PERFORM public._v2_release_reservation(d.id, 'store_cancelled', 'cancel', true);
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.ride_requests_v2_after_cancel() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ride_requests_v2_after_cancel ON public.ride_requests;
CREATE TRIGGER ride_requests_v2_after_cancel AFTER UPDATE OF status ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION public.ride_requests_v2_after_cancel();
DROP TRIGGER IF EXISTS ride_requests_v2_barrier ON public.ride_requests;
CREATE TRIGGER ride_requests_v2_barrier BEFORE UPDATE ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION public.ride_requests_v2_barrier();

-- ============================================================
-- 6. Leituras seguras para as telas (nenhuma conta no app)
-- ============================================================
-- Cliente ou loja do pedido: estado da entrega, valores e tempo da reserva
CREATE OR REPLACE FUNCTION public.get_order_delivery_view(p_order uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE o public.orders; s public.stores; d public.order_delivery_dispatches; v_driver jsonb; v_uid uuid := auth.uid();
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO s FROM public.stores WHERE id = o.store_id;
    IF v_uid IS NULL OR (o.buyer_id IS DISTINCT FROM v_uid AND s.owner_id IS DISTINCT FROM v_uid) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE order_id = o.id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('flow_version', o.delivery_flow_version, 'has_delivery', false, 'order_status', o.status);
    END IF;
    IF d.flow_version = 2 AND d.status = 'accepted' THEN
        SELECT jsonb_build_object('slug', p."profileSlug", 'name', p.name) INTO v_driver
          FROM public.ride_requests r JOIN public.profiles p ON p.id = r.driver_id WHERE r.id = d.ride_request_id;
    END IF;
    RETURN jsonb_build_object(
        'flow_version', d.flow_version, 'has_delivery', true, 'order_status', o.status,
        'phase', d.phase, 'state', CASE WHEN d.flow_version = 2 THEN public._v2_state_code(d.phase, d.status) END,
        'estimated_freight', d.estimated_freight,
        'current_offer', CASE WHEN d.status = 'searching' THEN d.final_freight END,
        'frozen_freight', d.frozen_freight,
        'definitive', d.frozen_freight IS NOT NULL AND d.phase IN ('ENTREGADOR_RESERVADO', 'AGUARDANDO_PAGAMENTO_CLIENTE'),
        'items_total', o.total_amount - COALESCE(o.delivery_fee, 0),
        'delivery_fee', o.delivery_fee, 'total_amount', o.total_amount,
        'reserved_until', CASE WHEN d.reservation_released_at IS NULL THEN d.reserved_until END,
        'reservation_released_at', d.reservation_released_at, 'reservation_release_reason', d.reservation_release_reason,
        'search_end_reason', d.search_end_reason, 'driver', v_driver);
END;
$$;

-- Motorista da corrida: ela está liberada para andar? (a tela só esconde o botão; o gatilho é quem barra)
CREATE OR REPLACE FUNCTION public.get_driver_delivery_gate(p_ride uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.ride_requests; d public.order_delivery_dispatches;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride;
    IF NOT FOUND OR auth.uid() IS NULL OR r.driver_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = p_ride;
    IF NOT FOUND OR d.flow_version <> 2 THEN RETURN jsonb_build_object('v2', false, 'released', true); END IF;
    RETURN jsonb_build_object('v2', true, 'phase', d.phase, 'released', public._v2_phase_released(d.phase),
                              'reserved_until', CASE WHEN d.reservation_released_at IS NULL THEN d.reserved_until END,
                              'frozen_freight', d.frozen_freight);
END;
$$;

REVOKE ALL ON FUNCTION public._v2_phase_released(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._v2_state_code(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._v2_set_order_freight(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._v2_release_reservation(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._v2_expire_reservation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_delivery_search_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_v2_reserved() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_v2_closed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ride_requests_v2_barrier() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_order_delivery_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_delivery_view(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_driver_delivery_gate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_delivery_gate(uuid) TO authenticated;

-- ============================================================
-- 7. Funções existentes ajustadas
-- ============================================================
-- reserva real no aceite (a fase continua sendo avançada pelos gatilhos acima)
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
                -- reserva real: o motorista vencedor fica preso por reservation_timeout_minutes (a janela de pagamento da próxima etapa)
                NEW.reserved_at := now();
                NEW.reserved_until := now() + make_interval(mins => (SELECT reservation_timeout_minutes FROM public.delivery_dispatch_settings WHERE id));
                NEW.reservation_released_at := NULL;
                NEW.reservation_release_reason := NULL;
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

-- o congelado só zera na liberação da reserva
CREATE OR REPLACE FUNCTION public.dispatch_estimate_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.estimated_freight IS NOT NULL AND NEW.estimated_freight IS DISTINCT FROM OLD.estimated_freight THEN
        RAISE EXCEPTION 'A estimativa inicial da entrega é histórica e não muda quando a oferta sobe' USING ERRCODE = '42501';
    END IF;
    IF OLD.estimate_id IS NOT NULL AND NEW.estimate_id IS DISTINCT FROM OLD.estimate_id THEN
        RAISE EXCEPTION 'A estimativa que originou a entrega não muda' USING ERRCODE = '42501';
    END IF;
    IF OLD.frozen_freight IS NOT NULL AND (NEW.frozen_freight IS DISTINCT FROM OLD.frozen_freight OR NEW.freight_frozen_at IS DISTINCT FROM OLD.freight_frozen_at)
       -- única exceção: a liberação da reserva (o motorista que aceitou saiu) zera o congelado; a história fica nos eventos
       AND NOT (OLD.flow_version = 2 AND COALESCE(current_setting('app.delivery_v2_release', true), '') = '1'
                AND NEW.frozen_freight IS NULL AND NEW.freight_frozen_at IS NULL AND NEW.reservation_released_at IS NOT NULL) THEN
        RAISE EXCEPTION 'O frete definitivo (aceito pelo motorista) não muda' USING ERRCODE = '42501';
    END IF;
    IF OLD.flow_version = 2 AND OLD.frozen_freight IS NOT NULL AND NEW.final_freight IS DISTINCT FROM OLD.final_freight THEN
        RAISE EXCEPTION 'A oferta não muda depois que o frete foi congelado' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$function$;

-- auditoria: reserva repetida e liberação com motorista e valor liberado
CREATE OR REPLACE FUNCTION public.audit_dispatch_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor uuid := auth.uid();
    v_role text := NULLIF(current_setting('app.delivery_actor', true), '');
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'estimate_recorded', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('estimated_freight', NEW.estimated_freight, 'original_freight', CASE WHEN NEW.flow_version = 1 THEN NEW.original_freight END,
                                   'radius_km', NEW.radius_km, 'flow_version', NEW.flow_version, 'estimate_id', NEW.estimate_id,
                                   'order_id', NEW.order_id,
                                   'calculation_version', (SELECT e.calculation_version FROM public.delivery_estimates e WHERE e.id = NEW.estimate_id),
                                   'estimate_snapshot', (SELECT e.snapshot FROM public.delivery_estimates e WHERE e.id = NEW.estimate_id)), now());
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_from, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'phase_change', NULL, NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('status', NEW.status, 'stage', NEW.stage, 'flow_version', NEW.flow_version), now());
        RETURN NEW;
    END IF;

    IF NEW.phase IS DISTINCT FROM OLD.phase THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_from, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, CASE WHEN NEW.phase = 'CANCELADO' THEN 'cancelled' ELSE 'phase_change' END, OLD.phase, NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('status', NEW.status, 'stage', NEW.stage, 'flow_version', NEW.flow_version), now());
    END IF;
    IF NEW.frozen_freight IS NOT NULL AND OLD.frozen_freight IS NULL THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'freight_frozen', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('frozen_freight', NEW.frozen_freight, 'estimated_freight', NEW.estimated_freight, 'authorized_extra', NEW.authorized_extra), now());
    END IF;
    IF NEW.reserved_at IS NOT NULL AND NEW.reserved_at IS DISTINCT FROM OLD.reserved_at THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'driver_reserved', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('reserved_until', NEW.reserved_until, 'frozen_freight', NEW.frozen_freight,
                                   'driver_id', (SELECT driver_id FROM public.ride_requests WHERE id = NEW.ride_request_id)), now());
    END IF;
    IF NEW.reservation_released_at IS NOT NULL AND NEW.reservation_released_at IS DISTINCT FROM OLD.reservation_released_at THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'reservation_released', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('reason', NEW.reservation_release_reason, 'released_frozen_freight', OLD.frozen_freight,
                                   'driver_id', (SELECT driver_id FROM public.ride_requests WHERE id = NEW.ride_request_id)), now());
    END IF;
    RETURN NEW;
END;
$function$;

-- cancelar durante a reserva (V2); V1 e busca iguais
CREATE OR REPLACE FUNCTION public.cancel_order_delivery(p_dispatch uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    d public.order_delivery_dispatches;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch FOR UPDATE;
    IF NOT FOUND OR d.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
    -- V2 com motorista reservado e ainda sem pagamento: o cliente pode cancelar se o admin permitir; o motorista é liberado e não nasce cobrança
    IF d.flow_version = 2 AND d.status = 'accepted' AND d.phase IN ('ENTREGADOR_RESERVADO', 'AGUARDANDO_PAGAMENTO_CLIENTE') THEN
        IF NOT (SELECT cancel_customer_during_reservation FROM public.delivery_dispatch_settings WHERE id) THEN
            RAISE EXCEPTION 'O cancelamento durante a reserva não está liberado' USING ERRCODE = '42501';
        END IF;
        PERFORM public._v2_release_reservation(d.id, 'customer_cancelled', 'cancel');
        RETURN;
    END IF;
    IF d.status <> 'searching' THEN RAISE EXCEPTION 'A entrega já tem motorista ou foi encerrada'; END IF;
    UPDATE public.ride_requests SET status = 'cancelled', cancelled_by = 'requester' WHERE id = d.ride_request_id AND status = 'pending';
    UPDATE public.order_delivery_rounds SET status = 'expired' WHERE dispatch_id = d.id AND status = 'pending_customer';
    UPDATE public.order_delivery_dispatches SET status = 'cancelled', updated_at = now() WHERE id = d.id;
END;
$function$;

-- sincronização corrida → entrega: V2 reservada não é encerrada pelo cancelamento da corrida (a liberação decide)
CREATE OR REPLACE FUNCTION public.sync_dispatch_with_ride()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    d public.order_delivery_dispatches;
    v_stage text;
BEGIN
    IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = NEW.id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    -- V2: cancelar a corrida durante a reserva não encerra a entrega por aqui; quem decide (voltar à busca ou cancelar) é a liberação da reserva
    IF d.flow_version = 2 AND NEW.status = 'cancelled' AND d.status = 'accepted' AND d.phase IN ('ENTREGADOR_RESERVADO', 'AGUARDANDO_PAGAMENTO_CLIENTE')
       AND COALESCE(current_setting('app.delivery_v2_release', true), '') <> '1' THEN
        RETURN NEW;
    END IF;

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
$function$;
