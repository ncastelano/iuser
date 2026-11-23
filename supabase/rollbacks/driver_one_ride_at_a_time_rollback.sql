-- desfaz 20261130000102_driver_one_ride_at_a_time.sql
DROP TRIGGER IF EXISTS b_ride_applications_one_at_a_time ON public.ride_applications;
DROP TRIGGER IF EXISTS b_ride_requests_one_at_a_time ON public.ride_requests;
DROP FUNCTION IF EXISTS public.ride_applications_one_at_a_time();
DROP FUNCTION IF EXISTS public.ride_requests_one_at_a_time();
DROP FUNCTION IF EXISTS public._driver_busy_for(uuid, uuid);
