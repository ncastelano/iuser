-- ROLLBACK da Etapa 2.7 (migration 20261102): volta ao estado da Etapa 2.6.
-- Remove as declarações financeiras V2, a chave Pix do motorista e o bloqueio por dinheiro declarado; restaura as funções anteriores.
-- Recusa rodar se já existir declaração de pagamento V2 ou entrega V2 em fase financeira (a história do dinheiro declarado se perderia).
-- Rode com: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/rollbacks/etapa_2_7_rollback.sql
begin;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.delivery_payment_events e JOIN public.order_delivery_dispatches d ON d.id = e.dispatch_id WHERE d.flow_version = 2)
       OR EXISTS (SELECT 1 FROM public.order_delivery_dispatches WHERE flow_version = 2 AND phase IN ('LOJA_INFORMOU_RECEBIMENTO', 'AGUARDANDO_PAGAMENTO_ENTREGADOR',
                  'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR', 'PAGAMENTO_EM_VERIFICACAO', 'ENTREGADOR_CONFIRMOU_RECEBIMENTO', 'ENTREGA_LIBERADA')) THEN
        RAISE EXCEPTION 'Existem declarações/entregas V2 em fase financeira; resolva-as antes de reverter a Etapa 2.7';
    END IF;
END $$;

DROP FUNCTION IF EXISTS public.get_delivery_payment_view(uuid);
DROP FUNCTION IF EXISTS public.open_delivery_incident(uuid, text, text);
DROP FUNCTION IF EXISTS public.driver_report_receipt(uuid, boolean, numeric);
DROP FUNCTION IF EXISTS public.store_report_driver_payment(uuid, numeric);
DROP FUNCTION IF EXISTS public.store_report_customer_payment(uuid, text);

-- funções anteriores (a candidatura deixa de exigir Pix; a barreira e o cancelamento voltam ao desenho da 2.6)
CREATE OR REPLACE FUNCTION public.ride_applications_v2_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.ride_requests_v2_barrier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.process_delivery_search_v2()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

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

CREATE OR REPLACE FUNCTION public._v2_state_code(p_phase text, p_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_driver_delivery_gate(p_ride uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

DROP FUNCTION IF EXISTS public._v2_financial_timeout(uuid);
DROP FUNCTION IF EXISTS public._v2_phase_money(text);
DROP FUNCTION IF EXISTS public.get_my_payout_status();
DROP FUNCTION IF EXISTS public.set_my_payout_pix(text, text, boolean);
DROP FUNCTION IF EXISTS public._pix_mask(text, text);
DROP FUNCTION IF EXISTS public._pix_key_valid(text, text);
DROP FUNCTION IF EXISTS public._pix_normalize(text, text);
DROP TABLE IF EXISTS public.driver_payout_keys;
DROP INDEX IF EXISTS public.dpe_once_per_dispatch;
DELETE FROM public.delivery_phase_transitions WHERE actor_role = 'system' AND to_phase = 'PAGAMENTO_EM_VERIFICACAO' AND from_phase IN ('AGUARDANDO_PAGAMENTO_ENTREGADOR', 'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR');

commit;
