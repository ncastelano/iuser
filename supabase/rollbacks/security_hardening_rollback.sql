-- Rollback de 20261130000079_security_hardening.sql: devolve as funções como eram (sem limites) e as permissões antigas.
-- Só em emergência: reabre a fraude nos contadores e as funções internas ao app.
CREATE OR REPLACE FUNCTION public.increment_product_view_count(p_product_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    new_count INTEGER;
BEGIN
    UPDATE public.products
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE id = p_product_id
    RETURNING view_count INTO new_count;
    RETURN new_count;
END;
$function$

;
CREATE OR REPLACE FUNCTION public.increment_service_request_view_count(p_request_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    new_count INTEGER;
BEGIN
    UPDATE public.service_requests
    SET view_count = view_count + 1
    WHERE id = p_request_id
    RETURNING view_count INTO new_count;
    RETURN new_count;
END;
$function$

;
CREATE OR REPLACE FUNCTION public.increment_product_share_count(p_product uuid)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    UPDATE public.products SET share_count = share_count + 1 WHERE id = p_product RETURNING share_count;
$function$

;
CREATE OR REPLACE FUNCTION public.record_profile_visit(p_profile_id uuid, p_session_id text, p_viewer_id uuid DEFAULT NULL::uuid, p_anonymous_id text DEFAULT NULL::text, p_device_type text DEFAULT 'desktop'::text, p_referrer text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  recent_visit_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profile_visits
    WHERE profile_id = p_profile_id
      AND session_id = p_session_id
      AND created_at > (NOW() - INTERVAL '60 seconds')
  ) INTO recent_visit_exists;

  IF recent_visit_exists THEN
    RETURN FALSE;
  END IF;

  INSERT INTO profile_visits (
    profile_id, viewer_id, anonymous_id, session_id,
    device_type, referrer, user_agent
  ) VALUES (
    p_profile_id, p_viewer_id, p_anonymous_id, p_session_id,
    p_device_type, p_referrer, p_user_agent
  );

  UPDATE profiles
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_profile_id;

  RETURN TRUE;
END;
$function$

;
CREATE OR REPLACE FUNCTION public.track_usage(p_egress_bytes bigint DEFAULT 0, p_realtime_messages bigint DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    insert into public.usage_telemetry_daily (day, egress_bytes, realtime_messages)
    values (current_date, greatest(p_egress_bytes, 0), greatest(p_realtime_messages, 0))
    on conflict (day) do update set
        egress_bytes = usage_telemetry_daily.egress_bytes + excluded.egress_bytes,
        realtime_messages = usage_telemetry_daily.realtime_messages + excluded.realtime_messages,
        updated_at = now();
end;
$function$

;
CREATE OR REPLACE FUNCTION public.track_service_usage(p_service text, p_metric text, p_count integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.service_usage_telemetry_daily (day, service, metric, count, updated_at)
    VALUES (current_date, p_service, p_metric, p_count, now())
    ON CONFLICT (day, service, metric)
    DO UPDATE SET count = service_usage_telemetry_daily.count + p_count, updated_at = now();
END;
$function$

;
GRANT EXECUTE ON FUNCTION public._grant_hierarchy_borders(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._grant_prepaid_borders(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._wait_auto_end(uuid, text, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._community_close_rounds(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_campaign_code(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_store_visit(uuid, text, uuid, text, text, text, text) TO PUBLIC, anon, authenticated;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'counter-hits-purge'; END IF; END $$;
DROP FUNCTION IF EXISTS public.counter_hits_purge();
DROP FUNCTION IF EXISTS public._counter_allow(text, uuid, boolean);
DROP FUNCTION IF EXISTS public.counter_anon_cap();
DROP TABLE IF EXISTS public.counter_hits;
DROP TABLE IF EXISTS public.counter_anon_buckets;
