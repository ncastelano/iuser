-- Desfaz 20261130000009_store_favorite_drivers: volta a oferta de entrega aberta para todos e remove os favoritos.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'favorite-windows-tick';
DROP TRIGGER IF EXISTS ride_requests_set_exclusivity ON public.ride_requests;
DROP FUNCTION IF EXISTS public.set_ride_exclusivity();
DROP POLICY IF EXISTS ride_offers_select ON public.ride_offers;
CREATE POLICY ride_offers_select ON public.ride_offers FOR SELECT TO authenticated
    USING (NOT EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.id = ride_offers.id AND r.requester_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_ride_applications_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_offered numeric;
    v_order uuid;
    v_active integer;
    v_cap integer;
    v_units numeric;
    v_cap_units numeric;
    v_new_units numeric;
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF NEW.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Candidatura nova começa pendente' USING ERRCODE = '42501';
    END IF;
    IF NEW.proposed_price IS NOT NULL AND (NEW.proposed_price <= 0 OR NEW.proposed_price > 100000) THEN
        RAISE EXCEPTION 'Valor inválido' USING ERRCODE = '42501';
    END IF;
    SELECT order_id, offered_price INTO v_order, v_offered FROM public.ride_offers WHERE id = NEW.ride_request_id;
    IF v_order IS NOT NULL AND NEW.proposed_price IS DISTINCT FROM v_offered THEN
        RAISE EXCEPTION 'O frete desta entrega é fixo (R$ %): aceite o valor oferecido', v_offered USING ERRCODE = '42501';
    END IF;
    IF v_order IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('delivery_capacity:' || NEW.applicant_id::text));
        SELECT count(*) INTO v_active FROM public.ride_requests WHERE driver_id = NEW.applicant_id AND order_id IS NOT NULL AND status = 'accepted';
        SELECT COALESCE(max(delivery_capacity), 1) INTO v_cap FROM public.driver_vehicles WHERE driver_id = NEW.applicant_id;
        IF v_active >= v_cap THEN
            RAISE EXCEPTION 'Sua mochila está cheia: você já está com % entrega(s) e a sua capacidade é %', v_active, v_cap USING ERRCODE = '42501', HINT = 'delivery_capacity_full';
        END IF;
        SELECT max(delivery_capacity_units) INTO v_cap_units FROM public.driver_vehicles WHERE driver_id = NEW.applicant_id;
        IF v_cap_units IS NOT NULL THEN
            SELECT COALESCE(sum(delivery_units), 0) INTO v_units FROM public.ride_requests WHERE driver_id = NEW.applicant_id AND order_id IS NOT NULL AND status = 'accepted';
            SELECT COALESCE(delivery_units, 1) INTO v_new_units FROM public.ride_offers WHERE id = NEW.ride_request_id;
            IF v_units + v_new_units > v_cap_units THEN
                RAISE EXCEPTION 'Não cabe na sua mochila: você já leva % unidade(s), esta tem % e você informou caber %', v_units, v_new_units, v_cap_units USING ERRCODE = '42501', HINT = 'delivery_capacity_units_full';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

DELETE FROM public.order_delivery_events WHERE kind = 'favorites_window_ended';
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_kind_check;
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_kind_check CHECK (kind = ANY (ARRAY[
    'tick', 'price_raised', 'delivered', 'round_started', 'reajust_requested', 'reservation_notice', 'phase_change', 'estimate_recorded', 'freight_frozen',
    'driver_reserved', 'reservation_released', 'payment_declared', 'cancelled', 'incident_opened', 'obligation_created', 'admin_decision', 'reajust_decided', 'search_ended']));
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_audit_processed_check;
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_audit_processed_check CHECK (
    (kind = ANY (ARRAY['tick', 'price_raised', 'delivered', 'round_started', 'reajust_requested', 'reservation_notice'])) OR (processed_at IS NOT NULL));

DELETE FROM public.profile_notifications WHERE kind IN ('favorite_invite', 'favorite_accepted', 'favorite_declined');
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup', 'service_application',
    'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review',
    'customer_review', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered', 'delivery_driver_assigned',
    'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready', 'delivery_completed', 'delivery_done',
    'delivery_driver_cancelled', 'delivery_cancelled', 'delivery_at_door', 'delivery_message', 'delivery_issue']));

DROP FUNCTION IF EXISTS public.process_favorite_windows();
DROP FUNCTION IF EXISTS public.set_delivery_exclusivity(uuid, text);
DROP FUNCTION IF EXISTS public.get_my_exclusive_offers();
DROP FUNCTION IF EXISTS public.get_my_favorite_stores();
DROP FUNCTION IF EXISTS public.set_store_favorites_settings(uuid, boolean, integer);
DROP FUNCTION IF EXISTS public.suggest_favorite_drivers(uuid, text);
DROP FUNCTION IF EXISTS public.get_store_favorites(uuid);
DROP FUNCTION IF EXISTS public.leave_favorite(uuid);
DROP FUNCTION IF EXISTS public.respond_favorite_invite(uuid, boolean);
DROP FUNCTION IF EXISTS public.store_remove_favorite_driver(uuid, uuid);
DROP FUNCTION IF EXISTS public.store_add_favorite_driver(uuid, uuid);
DROP FUNCTION IF EXISTS public._exclusive_until_for(uuid, double precision, double precision, numeric, text);
DROP FUNCTION IF EXISTS public._offer_open_to(uuid, uuid);
DROP FUNCTION IF EXISTS public._favorites_available(uuid, double precision, double precision, numeric);
DROP FUNCTION IF EXISTS public._is_accepted_favorite(uuid, uuid);
DROP INDEX IF EXISTS public.ride_requests_exclusive_idx;
ALTER TABLE public.ride_requests DROP COLUMN IF EXISTS exclusive_until, DROP COLUMN IF EXISTS exclusive_released_at;
DROP TABLE IF EXISTS public.store_favorite_settings;
DROP TABLE IF EXISTS public.store_favorite_drivers;
