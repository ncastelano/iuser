-- Etapa 2.1 / B — HISTÓRICO DA ENTREGA: reaproveita order_delivery_events (e order_delivery_rounds) em vez de criar um
-- segundo histórico.
--
-- order_delivery_events já era a fila de avisos (a rota /api/internal/delivery-events reivindica as linhas com
-- processed_at NULL). Linhas de AUDITORIA entram com processed_at preenchido ("já processadas"): a fila de push nunca as
-- reivindica, então o comportamento dos avisos não muda. Cada linha de auditoria guarda fase antes/depois, quem agiu e os
-- metadados estritamente necessários.
--
-- Reconstruível a partir daqui + rounds + payment_events (migration C): estimativa, rodadas e raio (rounds), motoristas
-- notificados (rounds.notified_count), autorização do cliente (rounds.authorized_*), aceite, frete congelado, reserva,
-- liberação, pagamentos declarados, cancelamentos, ocorrências e obrigações.

ALTER TABLE public.order_delivery_events
    ADD COLUMN IF NOT EXISTS phase_from text,
    ADD COLUMN IF NOT EXISTS phase_to text,
    ADD COLUMN IF NOT EXISTS actor_id uuid,
    ADD COLUMN IF NOT EXISTS actor_role text,
    ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_kind_check;
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_kind_check CHECK (kind IN (
    -- fila de avisos (já existiam)
    'tick', 'price_raised', 'delivered',
    -- auditoria (nascem com processed_at preenchido)
    'phase_change', 'estimate_recorded', 'freight_frozen', 'driver_reserved', 'reservation_released',
    'payment_declared', 'cancelled', 'incident_opened', 'obligation_created', 'admin_decision'
));
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_actor_role_check
    CHECK (actor_role IS NULL OR actor_role IN ('system', 'customer', 'store', 'driver', 'admin'));
-- Linha de auditoria nunca fica na fila de avisos
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_audit_processed_check
    CHECK (kind IN ('tick', 'price_raised', 'delivered') OR processed_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS order_delivery_events_dispatch_idx ON public.order_delivery_events (dispatch_id, created_at);

-- Motoristas notificados por rodada (NULL = não registrado, ex.: rodadas antigas)
ALTER TABLE public.order_delivery_rounds
    ADD COLUMN IF NOT EXISTS notified_count integer CHECK (notified_count IS NULL OR notified_count >= 0);

-- Só o servidor (service role) registra: soma os avisos enviados à rodada vigente da entrega
CREATE OR REPLACE FUNCTION public.record_delivery_round_notified(p_dispatch uuid, p_count integer)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
    UPDATE public.order_delivery_rounds r
       SET notified_count = COALESCE(r.notified_count, 0) + GREATEST(COALESCE(p_count, 0), 0)
      FROM public.order_delivery_dispatches d
     WHERE d.id = p_dispatch AND r.dispatch_id = d.id AND r.round = d.round
$$;
REVOKE ALL ON FUNCTION public.record_delivery_round_notified(uuid, integer) FROM PUBLIC, anon, authenticated;

-- Auditoria automática das mudanças de fase/frete/reserva da entrega
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

DROP TRIGGER IF EXISTS order_delivery_dispatches_audit ON public.order_delivery_dispatches;
CREATE TRIGGER order_delivery_dispatches_audit
    AFTER INSERT OR UPDATE ON public.order_delivery_dispatches
    FOR EACH ROW EXECUTE FUNCTION public.audit_dispatch_changes();
