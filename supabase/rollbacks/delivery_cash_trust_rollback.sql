-- Rollback de 20261130000069_delivery_cash_trust.sql: tira a liberação por etapas (dinheiro/maquininha) e devolve a política
-- de ride_offers como estava na ...09 (favoritos). A trava do caixa (...12) continua.
DROP TRIGGER IF EXISTS a_ride_applications_cash_trust ON public.ride_applications;
DROP FUNCTION IF EXISTS public.ride_applications_cash_trust();
DROP POLICY IF EXISTS ride_offers_select ON public.ride_offers;
CREATE POLICY ride_offers_select ON public.ride_offers FOR SELECT TO authenticated
    USING (NOT EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.id = ride_offers.id AND r.requester_id = auth.uid())
           AND public._offer_open_to(ride_offers.id, auth.uid()));
DROP FUNCTION IF EXISTS public.cash_trust_filter(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.get_my_cash_trust();
DROP FUNCTION IF EXISTS public._cash_trust_ok(uuid, uuid);
DROP FUNCTION IF EXISTS public._cash_trust_check(uuid, uuid);
DROP FUNCTION IF EXISTS public._driver_cash_trust(uuid);
DROP FUNCTION IF EXISTS public._order_handles_money(text);
DROP TABLE IF EXISTS public.delivery_trust_settings;
