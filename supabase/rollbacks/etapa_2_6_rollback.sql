-- ROLLBACK da Etapa 2.6 (migration 20261101): volta ao estado da Etapa 2.5.
-- Remove a reserva real, o total definitivo automático, a barreira operacional e as leituras de tela; restaura as funções anteriores.
-- Recusa rodar se existir entrega V2 aceita/reservada (a reserva e o frete congelado dela se perderiam).
-- Rode com: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/rollbacks/etapa_2_6_rollback.sql
begin;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.order_delivery_dispatches WHERE flow_version = 2 AND (status = 'accepted' OR reserved_at IS NOT NULL)) THEN
        RAISE EXCEPTION 'Existem entregas V2 aceitas/reservadas; resolva-as antes de reverter a Etapa 2.6';
    END IF;
END $$;

DROP TRIGGER IF EXISTS ride_requests_v2_barrier ON public.ride_requests;
DROP TRIGGER IF EXISTS ride_requests_v2_after_cancel ON public.ride_requests;
DROP TRIGGER IF EXISTS order_delivery_dispatches_v2_reserved ON public.order_delivery_dispatches;
DROP FUNCTION IF EXISTS public.ride_requests_v2_barrier();
DROP FUNCTION IF EXISTS public.ride_requests_v2_after_cancel();
DROP FUNCTION IF EXISTS public.dispatch_v2_reserved();
DROP FUNCTION IF EXISTS public.get_order_delivery_view(uuid);
DROP FUNCTION IF EXISTS public.get_driver_delivery_gate(uuid);
DROP FUNCTION IF EXISTS public._v2_expire_reservation(uuid);
DROP FUNCTION IF EXISTS public._v2_release_reservation(uuid, text, text, boolean);

-- funções anteriores
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
    IF OLD.frozen_freight IS NOT NULL AND (NEW.frozen_freight IS DISTINCT FROM OLD.frozen_freight OR NEW.freight_frozen_at IS DISTINCT FROM OLD.freight_frozen_at) THEN
        RAISE EXCEPTION 'O frete definitivo (aceito pelo motorista) não muda' USING ERRCODE = '42501';
    END IF;
    IF OLD.flow_version = 2 AND OLD.frozen_freight IS NOT NULL AND NEW.final_freight IS DISTINCT FROM OLD.final_freight THEN
        RAISE EXCEPTION 'A oferta não muda depois que o frete foi congelado' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$function$;

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
    IF NEW.reserved_at IS NOT NULL AND OLD.reserved_at IS NULL THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'driver_reserved', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('reserved_until', NEW.reserved_until,
                                   'driver_id', (SELECT driver_id FROM public.ride_requests WHERE id = NEW.ride_request_id)), now());
    END IF;
    IF NEW.reservation_released_at IS NOT NULL AND OLD.reservation_released_at IS NULL THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'reservation_released', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('reason', NEW.reservation_release_reason), now());
    END IF;
    RETURN NEW;
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
    IF d.status <> 'searching' THEN RAISE EXCEPTION 'A entrega já tem motorista ou foi encerrada'; END IF;
    UPDATE public.ride_requests SET status = 'cancelled', cancelled_by = 'requester' WHERE id = d.ride_request_id AND status = 'pending';
    UPDATE public.order_delivery_rounds SET status = 'expired' WHERE dispatch_id = d.id AND status = 'pending_customer';
    UPDATE public.order_delivery_dispatches SET status = 'cancelled', updated_at = now() WHERE id = d.id;
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
    IF v_n > 0 THEN PERFORM public._ping_delivery_events(); END IF;
    RETURN v_n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_v2_closed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

DROP FUNCTION IF EXISTS public._v2_set_order_freight(uuid, numeric);
DROP FUNCTION IF EXISTS public._v2_state_code(text, text);
DROP FUNCTION IF EXISTS public._v2_phase_released(text);

DELETE FROM public.delivery_phase_transitions WHERE from_phase = 'ENTREGADOR_RESERVADO' AND to_phase = 'CANCELADO' AND actor_role = 'system';
DELETE FROM public.order_delivery_events WHERE kind = 'reservation_notice';
DELETE FROM public.order_delivery_rounds WHERE action = 'reopen';
ALTER TABLE public.order_delivery_rounds DROP CONSTRAINT IF EXISTS order_delivery_rounds_action_check;
ALTER TABLE public.order_delivery_rounds ADD CONSTRAINT order_delivery_rounds_action_check
    CHECK (action IS NULL OR action IN ('initial', 'radius', 'price', 'radius_price', 'hold'));
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_kind_check;
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_kind_check CHECK (kind IN (
    'tick', 'price_raised', 'delivered', 'round_started', 'reajust_requested',
    'phase_change', 'estimate_recorded', 'freight_frozen', 'driver_reserved', 'reservation_released',
    'payment_declared', 'cancelled', 'incident_opened', 'obligation_created', 'admin_decision',
    'reajust_decided', 'search_ended'));
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_audit_processed_check;
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_audit_processed_check
    CHECK (kind IN ('tick', 'price_raised', 'delivered', 'round_started', 'reajust_requested') OR processed_at IS NOT NULL);

commit;
