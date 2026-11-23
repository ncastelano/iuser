-- desfaz 20261130000106_store_checkins.sql
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN PERFORM cron.unschedule('store-checkins-purge') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='store-checkins-purge'); END IF; END $$;
DROP FUNCTION IF EXISTS public.get_store_here(uuid);
DROP FUNCTION IF EXISTS public.check_out_store();
DROP FUNCTION IF EXISTS public.check_in_store(uuid, double precision, double precision);
DROP FUNCTION IF EXISTS public.get_checkin_candidate(double precision, double precision);
DROP FUNCTION IF EXISTS public._dist_m(double precision, double precision, double precision, double precision);
DROP TABLE IF EXISTS public.store_checkin_log;
DROP TABLE IF EXISTS public.store_checkins;
