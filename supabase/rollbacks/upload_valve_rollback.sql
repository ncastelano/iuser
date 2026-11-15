-- Desfaz 20261130000032_upload_valve.sql. Religa tudo o que a válvula tinha desligado ANTES de apagar as marcas.
UPDATE public.upload_kinds SET enabled = true, valve_disabled_at = NULL WHERE valve_disabled_at IS NOT NULL;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'upload-valve-tick';
-- a recusa de envio volta a não dizer "válvula"
CREATE OR REPLACE FUNCTION public.authorize_upload(p_bucket text, p_path text, p_bytes bigint, p_mime text, p_upsert boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    r      jsonb;
    v_uid  uuid := auth.uid();
    v_kind text;
BEGIN
    r := public._authorize_upload_core(p_bucket, p_path, p_bytes, p_mime, p_upsert);
    IF v_uid IS NOT NULL AND COALESCE((r->>'ok')::boolean, false) IS NOT TRUE AND COALESCE(r->>'error', '') <> 'not_authenticated' THEN
        SELECT k.kind INTO v_kind FROM public.upload_kinds k WHERE k.bucket = p_bucket ORDER BY k.enabled DESC, k.kind LIMIT 1;
        PERFORM public._upload_log_denial(v_uid, v_kind, COALESCE(r->>'error', 'unknown'));
    END IF;
    RETURN r;
END $$;
DROP FUNCTION IF EXISTS public.get_my_upload_limits();
CREATE FUNCTION public.get_my_upload_limits()
RETURNS TABLE (kind text, label text, bucket text, provider text, enabled boolean, max_bytes bigint, per_hour_files integer, per_day_bytes bigint, per_user_bytes bigint,
               used_bytes bigint, used_files bigint, used_day_bytes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT k.kind, k.label, k.bucket, k.provider, k.enabled, k.max_bytes, k.per_hour_files, k.per_day_bytes, k.per_user_bytes,
           COALESCE(sum(m.bytes) FILTER (WHERE m.state = 'ready'), 0)::bigint, (count(m.id) FILTER (WHERE m.state = 'ready'))::bigint,
           COALESCE(sum(m.bytes) FILTER (WHERE m.state = 'ready' AND m.created_at > now() - interval '24 hours'), 0)::bigint
      FROM public.upload_kinds k LEFT JOIN public.media_assets m ON m.kind = k.kind AND m.owner_id = auth.uid()
     WHERE auth.uid() IS NOT NULL GROUP BY k.kind ORDER BY k.label;
$$;
REVOKE ALL ON FUNCTION public.get_my_upload_limits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_upload_limits() TO authenticated;
DROP FUNCTION IF EXISTS public.admin_upload_valve_kind(text, integer, uuid);
DROP FUNCTION IF EXISTS public.admin_upload_valve_override(integer, uuid);
DROP FUNCTION IF EXISTS public.admin_upload_valve_update(jsonb, uuid);
DROP FUNCTION IF EXISTS public.admin_upload_valve_status();
DROP FUNCTION IF EXISTS public.upload_valve_tick();
DROP FUNCTION IF EXISTS public._upload_valve_release();
DROP FUNCTION IF EXISTS public._upload_valve_measure();
DROP FUNCTION IF EXISTS public._upload_valve_cycle_start(integer);
DROP TABLE IF EXISTS public.upload_valve_events;
DROP TABLE IF EXISTS public.upload_valve_settings;
ALTER TABLE public.upload_kinds DROP CONSTRAINT IF EXISTS upload_kinds_valve_stage_check;
ALTER TABLE public.upload_kinds DROP COLUMN IF EXISTS valve_disabled_at, DROP COLUMN IF EXISTS valve_stage;
