-- Etapa 2.4.1 — CONSISTÊNCIA DOS VALORES DE FRETE (uma fonte oficial por conceito) e proteção do V2 contra a máquina do V1.
--
-- Semântica oficial (V2; no V1 nada muda):
--   ESTIMATIVA INICIAL  = order_delivery_dispatches.estimated_freight  (+ estimate_id + snapshot em delivery_estimates). Imutável.
--   OFERTA ATUAL        = order_delivery_dispatches.final_freight       (valor vigente autorizado pelo cliente). O nome é legado:
--                         NÃO é o valor definitivo. ride_requests.offered_price é só a PROJEÇÃO que o motorista enxerga
--                         (oferta − taxa da plataforma, mantida pelas mesmas funções); order_delivery_rounds é o HISTÓRICO das ofertas.
--   FRETE ACEITO        = order_delivery_dispatches.frozen_freight      NULL até o motorista aceitar; no aceite recebe exatamente a
--                         oferta vigente e nunca mais muda (nem a oferta muda depois disso no V2).
--   original_freight    = legado do V1 (âncora de authorized_extra: final = original + extra). No V2 repete a estimativa e NÃO é fonte
--                         de nada: a história da estimativa é estimated_freight + estimate_id + snapshot.
--
-- Os gatilhos/funções do V1 (cron de reajuste, respostas de aumento/contraproposta) trabalham com original/final; por isso o
-- V2 não pode passar por eles até a etapa que os reescreve: o cron ignora linhas V2 e rodadas V2 só aceitam a 'initial'.

COMMENT ON COLUMN public.order_delivery_dispatches.estimated_freight IS 'ESTIMATIVA INICIAL (fonte oficial). Imutável. V2: = delivery_estimates.estimated_freight via estimate_id.';
COMMENT ON COLUMN public.order_delivery_dispatches.final_freight IS 'OFERTA ATUAL autorizada pelo cliente (fonte oficial da oferta). Nome legado: NÃO é o frete definitivo; o definitivo é frozen_freight.';
COMMENT ON COLUMN public.order_delivery_dispatches.frozen_freight IS 'FRETE ACEITO/CONGELADO (fonte oficial). NULL até o aceite do motorista; depois = oferta vigente no aceite, imutável.';
COMMENT ON COLUMN public.order_delivery_dispatches.original_freight IS 'LEGADO V1: âncora do acréscimo autorizado (final = original + authorized_extra). No V2 só repete a estimativa; não usar como fonte.';
COMMENT ON COLUMN public.ride_requests.offered_price IS 'O que o MOTORISTA enxerga/aceita: projeção da oferta atual (final_freight − taxa da plataforma) mantida pelo servidor. Não é fonte própria.';

-- V1 (cron de reajuste) nunca toca entregas V2
CREATE OR REPLACE FUNCTION public.process_order_delivery_dispatches()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        WHERE flow_version = 1 AND status = 'searching' AND round_started_at + make_interval(mins => cfg.retry_interval_minutes) <= now()
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
$function$;

-- rodadas de reajuste/contraproposta do V1 não existem no V2 ainda
CREATE OR REPLACE FUNCTION public.delivery_rounds_v2_fence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.kind <> 'initial' AND EXISTS (SELECT 1 FROM public.order_delivery_dispatches d WHERE d.id = NEW.dispatch_id AND d.flow_version = 2) THEN
        RAISE EXCEPTION 'Reajuste e contraproposta do novo fluxo ainda não estão implementados' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS order_delivery_rounds_v2_fence ON public.order_delivery_rounds;
CREATE TRIGGER order_delivery_rounds_v2_fence BEFORE INSERT ON public.order_delivery_rounds
    FOR EACH ROW EXECUTE FUNCTION public.delivery_rounds_v2_fence();

-- congelamento do V2 no aceite
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

-- frete congelado e estimativa imutáveis
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

-- auditoria: original_freight é só do V1
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
