DROP FUNCTION IF EXISTS public.get_ride_driver_pix(uuid);
DROP FUNCTION IF EXISTS public.get_ride_applicants_pix(uuid);
COMMENT ON COLUMN public.driver_payout_keys.consent_at IS NULL;
