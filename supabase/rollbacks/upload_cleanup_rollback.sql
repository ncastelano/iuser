-- Desfaz 20261130000022_upload_cleanup.sql: tira a limpeza de arquivos sem uso e o agendamento da conferência diária.
-- Os ARQUIVOS no Storage e o registro (media_assets) NÃO são tocados; só somem as colunas da limpeza (marca de "sem uso", "manter") e o histórico das rodadas.
-- O que a limpeza já apagou do Storage não volta (o Storage não tem lixeira).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'media-assets-reconcile';

DROP FUNCTION IF EXISTS public.admin_upload_cleanup_settings(jsonb, uuid);
DROP FUNCTION IF EXISTS public.admin_upload_cleanup_keep(uuid, boolean, uuid);
DROP FUNCTION IF EXISTS public.admin_upload_cleanup_overview();
DROP FUNCTION IF EXISTS public.upload_cleanup_record_run(text, boolean, timestamptz, jsonb, text);
DROP FUNCTION IF EXISTS public.upload_cleanup_confirm(uuid[]);
DROP FUNCTION IF EXISTS public.upload_cleanup_due(integer);
DROP FUNCTION IF EXISTS public.upload_cleanup_scan(integer);
DROP FUNCTION IF EXISTS public._media_cleanup_candidate(public.media_assets, public.upload_kinds, public.upload_settings);
DROP FUNCTION IF EXISTS public._media_cited_names(text[]);

-- a conferência volta a ser a da 20261130000019 (sem motivo e sem agendamento)
CREATE OR REPLACE FUNCTION public.media_assets_reconcile() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE v_n integer;
BEGIN
    UPDATE public.media_assets m SET state = 'deleted', deleted_at = now()
    WHERE m.state = 'ready' AND m.provider = 'supabase'
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = m.bucket AND o.name = m.key);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public.media_assets_reconcile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_assets_reconcile() TO service_role;

DROP TABLE IF EXISTS public.upload_cleanup_runs;
DROP INDEX IF EXISTS public.media_assets_orphan_idx;
ALTER TABLE public.media_assets DROP COLUMN IF EXISTS orphan_since, DROP COLUMN IF EXISTS ref_checked_at, DROP COLUMN IF EXISTS keep, DROP COLUMN IF EXISTS deleted_reason;
ALTER TABLE public.upload_kinds DROP COLUMN IF EXISTS cleanup_eligible;
ALTER TABLE public.upload_settings DROP COLUMN IF EXISTS cleanup_enabled, DROP COLUMN IF EXISTS cleanup_min_age_days, DROP COLUMN IF EXISTS cleanup_quarantine_days, DROP COLUMN IF EXISTS cleanup_max_per_run;
