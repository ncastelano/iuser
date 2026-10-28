-- Rollback de 20261130000004_live_order_events.sql
DROP TRIGGER IF EXISTS ride_requests_zz_notify_delivery ON public.ride_requests;
DROP FUNCTION IF EXISTS public.trg_notify_delivery_events();
DROP TRIGGER IF EXISTS orders_zz_notify_events ON public.orders;
DROP FUNCTION IF EXISTS public.trg_notify_order_events();
DROP FUNCTION IF EXISTS public._person_label(uuid);
DELETE FROM public.profile_notifications WHERE kind IN ('order_new','order_accepted','order_ready','order_rejected','order_delivered','delivery_driver_assigned','delivery_driver_accepted','delivery_driver_arrived','delivery_picked_up','delivery_order_ready','delivery_completed','delivery_done','delivery_driver_cancelled','delivery_cancelled');
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY['follow','profile_view','link_visit','publication_like','service_like','product_like','publication_comment','profile_comment','comment_reply','comment_like','invite_signup','service_application','service_selected','service_completed','service_review','ride_application','ride_selected','ride_review','customer_review','appointment_new','appointment_confirmed','appointment_cancelled','appointment_changed','group_invite']));
