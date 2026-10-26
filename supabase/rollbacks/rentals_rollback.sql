-- Desfaz o aluguel de imóveis (migration 20261126). Apaga os anúncios!
DROP FUNCTION IF EXISTS public.track_rental_view(uuid);
DROP FUNCTION IF EXISTS public.get_rental_reviews(uuid);
DROP FUNCTION IF EXISTS public.get_rental_host_trust(uuid);
DROP FUNCTION IF EXISTS public.get_rental_address(uuid);
DROP TRIGGER IF EXISTS appointments_rental_link ON public.appointments;
DROP FUNCTION IF EXISTS public.appointments_rental_link_check();
ALTER TABLE public.appointments DROP COLUMN IF EXISTS rental_listing_id;
DELETE FROM public.driver_postpaid_charges WHERE type = 'rental_listing_fee';
DELETE FROM public.service_pricing WHERE service_type = 'rental_listing_fee';
ALTER TABLE public.driver_postpaid_charges DROP COLUMN IF EXISTS rental_listing_id;
ALTER TABLE public.driver_postpaid_charges DROP CONSTRAINT IF EXISTS driver_postpaid_charges_type_check;
ALTER TABLE public.driver_postpaid_charges ADD CONSTRAINT driver_postpaid_charges_type_check
    CHECK (type IN ('ride_fee', 'service_fee', 'order_fee', 'in_person_fee', 'product_fee', 'publication_fee', 'service_listing_fee',
                    'schedule_activation_fee', 'appointment_fee', 'whatsapp_bot_message_fee', 'payment'));
ALTER TABLE public.service_pricing DROP CONSTRAINT IF EXISTS service_pricing_service_type_check;
ALTER TABLE public.service_pricing ADD CONSTRAINT service_pricing_service_type_check
    CHECK (service_type IN ('ride_fee', 'service_fee', 'order_fee', 'in_person_fee', 'product_fee', 'publication_fee', 'service_listing_fee',
                            'schedule_activation_fee', 'appointment_fee', 'whatsapp_bot_message_fee', 'whatsapp_bot_message_fee_postpaid'));
DROP TABLE IF EXISTS public.rental_listing_private;
DROP TABLE IF EXISTS public.rental_listings;
DROP FUNCTION IF EXISTS public.rental_listing_gate();
DROP FUNCTION IF EXISTS public.accrue_postpaid_rental_fee();
DROP FUNCTION IF EXISTS public.rental_listing_touch();
