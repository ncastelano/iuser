-- Rollback de 20261130000083: as rotas voltam a contar só na memória (lib/rateLimit.ts cai nela sozinho se a função não existir).
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'api-rate-limits-purge'; END IF; END $$;
DROP FUNCTION IF EXISTS public.api_rate_limits_purge();
DROP FUNCTION IF EXISTS public.rate_limit_hit(text, int, int);
DROP TABLE IF EXISTS public.api_rate_limits;
