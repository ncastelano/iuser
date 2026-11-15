-- Desfaz 20261130000042: esperas na corrida e tarifa por tempo do motorista. Apaga as esperas registradas (a tabela some).
DROP TRIGGER IF EXISTS ride_requests_close_waits ON public.ride_requests;
DROP FUNCTION IF EXISTS public.trg_close_ride_waits();
DROP FUNCTION IF EXISTS public.admin_set_ride_wait(numeric, integer, integer, uuid);
DROP FUNCTION IF EXISTS public.get_ride_wait_settings();
DROP FUNCTION IF EXISTS public.get_ride_waits(uuid);
DROP FUNCTION IF EXISTS public.end_ride_wait(uuid);
DROP FUNCTION IF EXISTS public.respond_ride_wait(uuid, boolean);
DROP FUNCTION IF EXISTS public.request_ride_wait(uuid, text, text);
DROP FUNCTION IF EXISTS public._wait_close(uuid, uuid);
DROP FUNCTION IF EXISTS public._wait_seconds(public.ride_waits);
DROP FUNCTION IF EXISTS public._wait_fee_cents(integer, integer, integer);
DROP TABLE IF EXISTS public.ride_waits;
DROP TABLE IF EXISTS public.ride_wait_settings;
ALTER TABLE public.driver_pricing DROP COLUMN IF EXISTS price_per_minute;
DELETE FROM public.profile_notifications WHERE kind IN ('ride_wait_requested', 'ride_wait_started', 'ride_wait_declined', 'ride_wait_ended');
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup', 'service_application',
    'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review',
    'customer_review', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered',
    'delivery_driver_assigned', 'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready',
    'delivery_completed', 'delivery_done', 'delivery_driver_cancelled', 'delivery_cancelled', 'delivery_at_door', 'delivery_message', 'delivery_issue',
    'favorite_invite', 'favorite_accepted', 'favorite_declined', 'dues_update', 'dispute_update', 'moderation_update',
    'ride_offer_new', 'ride_offer_declined', 'ride_offer_agreed', 'ride_offer_expired', 'digital_order_new', 'digital_access_released'
]));
CREATE OR REPLACE FUNCTION public.trg_ping_live_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.kind = ANY (ARRAY[
        'delivery_driver_assigned', 'delivery_picked_up', 'delivery_at_door', 'delivery_message', 'delivery_issue',
        'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_driver_cancelled', 'delivery_cancelled',
        'delivery_order_ready', 'delivery_completed',
        'favorite_invite', 'favorite_accepted', 'favorite_declined',
        'dues_update', 'dispute_update',
        'moderation_update',
        'ride_offer_new', 'ride_offer_declined', 'ride_offer_agreed', 'ride_offer_expired'
    ]) THEN
        PERFORM public._ping_delivery_events();
    END IF;
    RETURN NEW;
END; $$;
