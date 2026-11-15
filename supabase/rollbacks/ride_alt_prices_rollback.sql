-- Desfaz 20261130000064_ride_alt_prices.sql: tira os valores a mais da candidatura e volta select_ride_driver(p_ride, p_application).
DROP TRIGGER IF EXISTS ride_applications_alt_prices ON public.ride_applications;
DROP FUNCTION IF EXISTS public.ride_applications_alt_prices();
DROP FUNCTION IF EXISTS public.select_ride_driver(uuid, uuid, numeric);
CREATE OR REPLACE FUNCTION public.select_ride_driver(p_ride uuid, p_application uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r public.ride_requests;
    a public.ride_applications;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride FOR UPDATE;
    IF NOT FOUND OR r.requester_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.status <> 'pending' THEN RAISE EXCEPTION 'Este pedido já foi decidido.'; END IF;
    SELECT * INTO a FROM public.ride_applications WHERE id = p_application AND ride_request_id = p_ride;
    IF NOT FOUND OR a.status <> 'pending' THEN RAISE EXCEPTION 'Candidatura inválida'; END IF;
    IF a.applicant_id = r.requester_id THEN RAISE EXCEPTION 'Candidatura inválida'; END IF;

    UPDATE public.ride_requests SET status = 'accepted', driver_id = a.applicant_id,
        agreed_price = CASE WHEN a.proposed_price > 0 THEN round(a.proposed_price, 2) END WHERE id = p_ride AND status = 'pending';
    UPDATE public.ride_applications SET status = 'accepted' WHERE id = p_application;
    UPDATE public.ride_applications SET status = 'rejected' WHERE ride_request_id = p_ride AND status = 'pending' AND id <> p_application;
    UPDATE public.ride_price_offers SET status = CASE WHEN application_id = p_application AND author_role = 'driver' AND status = 'pending' THEN 'accepted' ELSE 'cancelled' END, responded_at = now()
     WHERE ride_request_id = p_ride AND status = 'pending';
    RETURN jsonb_build_object('ok', true, 'driver_id', a.applicant_id);
END; $function$

;
REVOKE ALL ON FUNCTION public.select_ride_driver(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_ride_driver(uuid, uuid) TO authenticated;
ALTER TABLE public.ride_applications DROP COLUMN IF EXISTS alt_prices;
