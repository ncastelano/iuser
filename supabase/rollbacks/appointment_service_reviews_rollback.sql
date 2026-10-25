-- Desfaz o ciclo de avaliações dos serviços agendados (migration 20261124). As avaliações já gravadas em product_reviews ficam.
DROP FUNCTION IF EXISTS public.get_client_track_record(uuid);
DROP FUNCTION IF EXISTS public.get_appointment_review_state(uuid);
DROP FUNCTION IF EXISTS public.submit_appointment_review(uuid, integer, text);
DROP FUNCTION IF EXISTS public.complete_appointment(uuid);
DROP FUNCTION IF EXISTS public._appointment_service_id(public.appointments);
DROP FUNCTION IF EXISTS public._appointment_service_owner(public.appointments);
DROP TABLE IF EXISTS public.appointment_reviews;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS completed_at;
