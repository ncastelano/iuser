-- Desfaz 20261130000038_ride_negotiation.sql (apaga o histórico de propostas e o ganho mínimo dos motoristas)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('ride-price-offers-expire') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ride-price-offers-expire');
    END IF;
END $$;
DROP FUNCTION IF EXISTS public.expire_ride_price_offers();
DROP FUNCTION IF EXISTS public.respond_ride_offer(uuid, boolean, numeric);
DROP FUNCTION IF EXISTS public.driver_counter(uuid, numeric, numeric);
DROP FUNCTION IF EXISTS public.passenger_counter(uuid, numeric);
DROP FUNCTION IF EXISTS public.set_passenger_offer(uuid, numeric);
-- volta a escolha do motorista ao que era (sem o preço acordado)
CREATE OR REPLACE FUNCTION public.select_ride_driver(p_ride uuid, p_application uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.ride_requests; a public.ride_applications;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride FOR UPDATE;
    IF NOT FOUND OR r.requester_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.status <> 'pending' THEN RAISE EXCEPTION 'Este pedido já foi decidido.'; END IF;
    SELECT * INTO a FROM public.ride_applications WHERE id = p_application AND ride_request_id = p_ride;
    IF NOT FOUND OR a.status <> 'pending' THEN RAISE EXCEPTION 'Candidatura inválida'; END IF;
    IF a.applicant_id = r.requester_id THEN RAISE EXCEPTION 'Candidatura inválida'; END IF;
    UPDATE public.ride_requests SET status = 'accepted', driver_id = a.applicant_id WHERE id = p_ride AND status = 'pending';
    UPDATE public.ride_applications SET status = 'accepted' WHERE id = p_application;
    UPDATE public.ride_applications SET status = 'rejected' WHERE ride_request_id = p_ride AND status = 'pending' AND id <> p_application;
    RETURN jsonb_build_object('ok', true, 'driver_id', a.applicant_id);
END; $$;
DROP FUNCTION IF EXISTS public._neg_confirm(public.ride_requests, public.ride_applications, numeric, uuid);
DROP TRIGGER IF EXISTS ride_applications_negotiation_init ON public.ride_applications;
DROP FUNCTION IF EXISTS public.ride_applications_negotiation_init();
DROP FUNCTION IF EXISTS public.driver_hourly_check(uuid, numeric, numeric);
DROP FUNCTION IF EXISTS public._ride_hourly(uuid, uuid, numeric, numeric);
DROP FUNCTION IF EXISTS public._neg_amount(numeric);
DROP FUNCTION IF EXISTS public._neg_cfg();
DROP TRIGGER IF EXISTS zz_ride_requests_sync_passenger_offer ON public.ride_requests;
DROP FUNCTION IF EXISTS public.sync_ride_offer_passenger_offer();
DROP TABLE IF EXISTS public.ride_price_offers;
ALTER TABLE public.ride_applications DROP COLUMN IF EXISTS last_offer_by, DROP COLUMN IF EXISTS last_offer_at;
ALTER TABLE public.ride_offers DROP COLUMN IF EXISTS passenger_offer;
ALTER TABLE public.ride_requests DROP COLUMN IF EXISTS passenger_offer, DROP COLUMN IF EXISTS agreed_price;
DROP TABLE IF EXISTS public.driver_earning_goals;
DROP TABLE IF EXISTS public.ride_negotiation_settings;
