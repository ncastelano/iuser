DROP TRIGGER IF EXISTS service_requests_round_coords ON public.service_requests;
DROP FUNCTION IF EXISTS public.service_requests_round_coords();
ALTER TABLE public.service_requests DROP COLUMN IF EXISTS approx_lat, DROP COLUMN IF EXISTS approx_lng;
