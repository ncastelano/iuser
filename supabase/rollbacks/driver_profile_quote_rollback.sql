-- Rollback de 20261130000072_driver_profile_quote.sql
DROP FUNCTION IF EXISTS public.get_driver_reviews(uuid, integer);
DROP FUNCTION IF EXISTS public.get_driver_public_quote(uuid);
ALTER TABLE public.driver_pricing DROP CONSTRAINT IF EXISTS driver_pricing_profile_quote_check;
ALTER TABLE public.driver_pricing DROP COLUMN IF EXISTS profile_quote;
