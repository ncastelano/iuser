-- ROLLBACK da Etapa 2.3 (migration 20261097): remove estimativas, chave de V2 por loja e as travas novas.
-- Restaura a função de auditoria da Etapa 2.1 (evento 'estimate_recorded' sem snapshot da estimativa).
-- Atenção: apaga os registros de delivery_estimates (snapshots de estimativas). Reverta também o código (git revert):
-- a rota /api/delivery/estimate depende dessas tabelas. Nenhuma entrega V1 depende delas.
-- Rode com: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/rollbacks/etapa_2_3_rollback.sql
begin;

DROP FUNCTION IF EXISTS public.get_estimate_store_origin(uuid);
DROP FUNCTION IF EXISTS public.record_delivery_estimate(uuid, uuid, double precision, double precision, integer, text, text);
DROP FUNCTION IF EXISTS public._compute_delivery_estimate(integer);
DROP FUNCTION IF EXISTS public._freight_round_cents(integer, integer, text);

DROP TRIGGER IF EXISTS order_delivery_dispatches_flow_gate ON public.order_delivery_dispatches;
DROP FUNCTION IF EXISTS public.dispatch_flow_gate();
DROP FUNCTION IF EXISTS public.store_uses_delivery_flow_v2(uuid);
DROP TRIGGER IF EXISTS stores_delivery_flow_seed ON public.stores;
DROP FUNCTION IF EXISTS public.store_delivery_flow_seed();
DROP TABLE IF EXISTS public.store_delivery_flow;

DROP TRIGGER IF EXISTS order_delivery_dispatches_estimate_immutable ON public.order_delivery_dispatches;
DROP FUNCTION IF EXISTS public.dispatch_estimate_immutable();

-- função de auditoria da 2.1 (sem estimate_id/snapshot); precisa vir antes de apagar a coluna que a versão nova lê
CREATE OR REPLACE FUNCTION public.audit_dispatch_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_role text := NULLIF(current_setting('app.delivery_actor', true), '');
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'estimate_recorded', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('estimated_freight', NEW.estimated_freight, 'original_freight', NEW.original_freight,
                                   'radius_km', NEW.radius_km, 'flow_version', NEW.flow_version), now());
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
$$;
REVOKE ALL ON FUNCTION public.audit_dispatch_changes() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.order_delivery_dispatches DROP COLUMN IF EXISTS estimate_id;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'delivery-estimates-cleanup';
DROP TRIGGER IF EXISTS delivery_estimates_no_edit ON public.delivery_estimates;
DROP FUNCTION IF EXISTS public.delivery_estimates_immutable();
DROP TABLE IF EXISTS public.delivery_estimates;

commit;
