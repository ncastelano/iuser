-- Devolve o endereço completo para a coluna pública (service_requests.location_address) e remove os gatilhos.
DROP TRIGGER IF EXISTS service_requests_hide_address_ins ON public.service_requests;
DROP TRIGGER IF EXISTS service_requests_hide_address_upd ON public.service_requests;
UPDATE public.service_requests r SET location_address = p.address FROM public.service_request_private p WHERE p.request_id = r.id AND p.address IS NOT NULL;
DROP FUNCTION IF EXISTS public.service_requests_hide_address_ins();
DROP FUNCTION IF EXISTS public.service_requests_hide_address_upd();
DROP FUNCTION IF EXISTS public._service_request_public_place(text);
ALTER TABLE public.service_request_private DROP COLUMN IF EXISTS address;
