-- Desfaz 20261130000039_ride_negotiation_notices.sql (volta a lista de tipos e o gatilho de push ao que eram; apaga os avisos dessa negociação)
DROP TRIGGER IF EXISTS ride_price_offers_notify ON public.ride_price_offers;
DROP FUNCTION IF EXISTS public.trg_notify_ride_price_offer();
DELETE FROM public.profile_notifications WHERE kind IN ('ride_offer_new', 'ride_offer_declined', 'ride_offer_agreed', 'ride_offer_expired');
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup', 'service_application',
    'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review',
    'customer_review', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered',
    'delivery_driver_assigned', 'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready',
    'delivery_completed', 'delivery_done', 'delivery_driver_cancelled', 'delivery_cancelled', 'delivery_at_door', 'delivery_message', 'delivery_issue',
    'favorite_invite', 'favorite_accepted', 'favorite_declined', 'dues_update', 'dispute_update', 'moderation_update'
]));
CREATE OR REPLACE FUNCTION public.trg_ping_live_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.kind = ANY (ARRAY[
        'delivery_driver_assigned', 'delivery_picked_up', 'delivery_at_door', 'delivery_message', 'delivery_issue',
        'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_driver_cancelled', 'delivery_cancelled',
        'delivery_order_ready', 'delivery_completed', 'favorite_invite', 'favorite_accepted', 'favorite_declined',
        'dues_update', 'dispute_update', 'moderation_update'
    ]) THEN PERFORM public._ping_delivery_events(); END IF;
    RETURN NEW;
END; $$;
