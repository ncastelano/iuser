-- Desfaz 20261130000006_delivery_arrival.sql (a complete_ride volta a NÃO exigir o aviso; as notificações delivery_at_door já gravadas são apagadas)
DROP TRIGGER IF EXISTS ride_requests_zz_notify_arrival ON public.ride_requests;
DROP FUNCTION IF EXISTS public.trg_notify_delivery_arrival();
DROP TRIGGER IF EXISTS ride_requests_guard_arrival ON public.ride_requests;
DROP FUNCTION IF EXISTS public.guard_arrival_column();
DROP FUNCTION IF EXISTS public.arrive_at_destination(uuid, double precision, double precision);
DELETE FROM public.profile_notifications WHERE kind = 'delivery_at_door';
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup', 'service_application',
    'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review',
    'customer_review', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered', 'delivery_driver_assigned',
    'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready', 'delivery_completed', 'delivery_done',
    'delivery_driver_cancelled', 'delivery_cancelled'
]));
ALTER TABLE public.ride_requests DROP COLUMN IF EXISTS arrived_destination_at;
-- (complete_ride: reaplique a definição de 20261087000000_ride_requests_write_guards.sql, seção 4)
