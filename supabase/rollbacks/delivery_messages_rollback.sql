-- Desfaz 20261130000008_delivery_messages.sql (apaga as mensagens e as notificações delivery_message/delivery_issue)
DROP FUNCTION IF EXISTS public.send_delivery_message(uuid, text);
DROP POLICY IF EXISTS delivery_messages_read ON public.delivery_messages;
DROP TABLE IF EXISTS public.delivery_messages;
DROP FUNCTION IF EXISTS public._can_see_delivery(uuid);
DROP FUNCTION IF EXISTS public._delivery_msg_text(text, text);
DELETE FROM public.profile_notifications WHERE kind IN ('delivery_message', 'delivery_issue');
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup', 'service_application',
    'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review',
    'customer_review', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered', 'delivery_driver_assigned',
    'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready', 'delivery_completed', 'delivery_done',
    'delivery_driver_cancelled', 'delivery_cancelled', 'delivery_at_door'
]));
-- (trg_notify_delivery_arrival: reaplique a definição de 20261130000006_delivery_arrival.sql)
