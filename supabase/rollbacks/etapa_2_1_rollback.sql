-- ROLLBACK da Etapa 2.1 (migrations 20261093, 20261094, 20261095): remove só o que a Etapa 2.1 criou.
-- Não toca em nada das Etapas 1.5/1.6 (ride_offers, guardas, share_token, RPCs) nem na monetização.
-- Atenção: apaga as linhas de AUDITORIA de order_delivery_events (as da fila de avisos — tick/price_raised/delivered — ficam)
-- e os dados das 3 tabelas novas (que nesta etapa nascem vazias). O código da Etapa 2.1 só registra notified_count
-- (best-effort): ao reverter, reverta também esse commit.
-- Rode com: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/rollbacks/etapa_2_1_rollback.sql
begin;

-- C: tabelas novas
DROP TABLE IF EXISTS public.delivery_incidents;
DROP TABLE IF EXISTS public.delivery_obligations;
DROP TABLE IF EXISTS public.delivery_payment_events;
DROP FUNCTION IF EXISTS public.delivery_payment_events_append_only();
DROP FUNCTION IF EXISTS public.delivery_touch_updated_at();

-- B: auditoria
DROP TRIGGER IF EXISTS order_delivery_dispatches_audit ON public.order_delivery_dispatches;
DROP FUNCTION IF EXISTS public.audit_dispatch_changes();
DROP FUNCTION IF EXISTS public.record_delivery_round_notified(uuid, integer);
ALTER TABLE public.order_delivery_rounds DROP COLUMN IF EXISTS notified_count;
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_audit_processed_check;
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_actor_role_check;
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_kind_check;
DELETE FROM public.order_delivery_events WHERE kind NOT IN ('tick', 'price_raised', 'delivered');
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_kind_check CHECK (kind IN ('tick', 'price_raised', 'delivered'));
DROP INDEX IF EXISTS public.order_delivery_events_dispatch_idx;
ALTER TABLE public.order_delivery_events
    DROP COLUMN IF EXISTS phase_from, DROP COLUMN IF EXISTS phase_to, DROP COLUMN IF EXISTS actor_id,
    DROP COLUMN IF EXISTS actor_role, DROP COLUMN IF EXISTS data;

-- A: fases e colunas da entrega
DROP TRIGGER IF EXISTS order_delivery_dispatches_phase ON public.order_delivery_dispatches;
DROP FUNCTION IF EXISTS public.dispatch_phase_maintain();
DROP INDEX IF EXISTS public.order_delivery_dispatches_phase_idx;
DROP INDEX IF EXISTS public.order_delivery_dispatches_reserved_idx;
ALTER TABLE public.order_delivery_dispatches
    DROP CONSTRAINT IF EXISTS odd_phase_fkey,
    DROP CONSTRAINT IF EXISTS odd_flow_version_check,
    DROP CONSTRAINT IF EXISTS odd_estimated_freight_check,
    DROP CONSTRAINT IF EXISTS odd_frozen_freight_check,
    DROP CONSTRAINT IF EXISTS odd_frozen_pair_check,
    DROP CONSTRAINT IF EXISTS odd_reservation_window_check,
    DROP CONSTRAINT IF EXISTS odd_reservation_release_reason_check,
    DROP CONSTRAINT IF EXISTS odd_reservation_release_pair_check;
ALTER TABLE public.order_delivery_dispatches
    DROP COLUMN IF EXISTS flow_version, DROP COLUMN IF EXISTS phase, DROP COLUMN IF EXISTS phase_changed_at,
    DROP COLUMN IF EXISTS estimated_freight, DROP COLUMN IF EXISTS frozen_freight, DROP COLUMN IF EXISTS freight_frozen_at,
    DROP COLUMN IF EXISTS reserved_at, DROP COLUMN IF EXISTS reserved_until,
    DROP COLUMN IF EXISTS reservation_released_at, DROP COLUMN IF EXISTS reservation_release_reason;
DROP TABLE IF EXISTS public.delivery_phase_transitions;
DROP TABLE IF EXISTS public.delivery_phases;
DROP FUNCTION IF EXISTS public._legacy_delivery_phase(text, text);

commit;
