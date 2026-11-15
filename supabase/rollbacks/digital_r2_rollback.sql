-- Desfaz 20261130000033_digital_r2.sql (digital pesado no R2). ATENÇÃO: os itens que estão no R2 (bucket = 'iuser-digital') perdem a referência: apague-os antes (ou copie os arquivos de volta).
DELETE FROM public.digital_contents WHERE bucket = 'iuser-digital';
DROP TRIGGER IF EXISTS digital_r2_guard ON public.digital_contents;
DROP FUNCTION IF EXISTS public.digital_r2_guard();
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_bucket_kind_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_bucket_kind_check CHECK (
    storage_path IS NULL OR (kind = 'audio' AND bucket = 'digital-music') OR (kind = 'app' AND bucket = 'digital-apps') OR (kind NOT IN ('audio', 'app') AND bucket = 'digital-files')) NOT VALID;
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_bucket_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_bucket_check CHECK (bucket IN ('digital-files', 'digital-music', 'digital-apps'));
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_file_name_check;
ALTER TABLE public.digital_contents DROP COLUMN IF EXISTS file_name;
DELETE FROM public.media_assets WHERE kind = 'digital_heavy';
DELETE FROM public.upload_grants WHERE kind = 'digital_heavy';
DELETE FROM public.upload_kinds WHERE kind = 'digital_heavy';

CREATE OR REPLACE FUNCTION public.get_digital_item_access(p_item uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.digital_contents;
BEGIN
    SELECT * INTO c FROM public.digital_contents WHERE id = p_item;
    IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false); END IF;
    IF public._is_hidden('digital_product', c.product_id) AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = c.product_id AND p.owner_id = auth.uid()) THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'hidden');
    END IF;
    IF NOT (c.is_preview OR c.is_teaser OR public._digital_access(c.product_id, auth.uid())) THEN RETURN jsonb_build_object('allowed', false); END IF;
    RETURN jsonb_build_object('allowed', true, 'kind', c.kind, 'title', c.title, 'storage_path', c.storage_path, 'bucket', c.bucket, 'external_url', c.external_url, 'mime_type', c.mime_type);
END $$;

CREATE OR REPLACE FUNCTION public.release_r2_asset(p_owner uuid, p_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
    IF EXISTS (SELECT 1 FROM public.flashes f WHERE f.media_url = p_key) THEN RETURN false; END IF;
    UPDATE public.media_assets SET state = 'deleted', deleted_at = now(), deleted_reason = 'owner'
    WHERE provider = 'r2' AND key = p_key AND owner_id = p_owner AND state = 'ready';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n > 0;
END; $$;
REVOKE ALL ON FUNCTION public.release_r2_asset(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_r2_asset(uuid, text) TO service_role;
-- as contas de banda voltam a contar tudo (corpo das migrations 32 e 31)
CREATE OR REPLACE FUNCTION public._upload_valve_measure() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.upload_valve_settings; v_cycle date; v_storage bigint; v_tele bigint; v_dl bigint; v_manual bigint := 0; v_egress bigint; v_sq numeric; v_eq numeric; v_sq_src text := 'valve'; v_eq_src text := 'valve'; v_q numeric;
BEGIN
    SELECT * INTO s FROM public.upload_valve_settings WHERE id;
    v_cycle := public._upload_valve_cycle_start(s.cycle_day);
    SELECT COALESCE(sum((metadata->>'size')::bigint), 0)::bigint INTO v_storage FROM storage.objects;
    SELECT COALESCE(sum(egress_bytes), 0)::bigint INTO v_tele FROM public.usage_telemetry_daily WHERE day >= v_cycle;
    SELECT COALESCE(sum(c.size_bytes), 0)::bigint INTO v_dl FROM public.digital_downloads d JOIN public.digital_contents c ON c.id = d.item_id WHERE d.day >= v_cycle;
    IF s.egress_manual_gb IS NOT NULL AND s.egress_manual_cycle = v_cycle THEN v_manual := (s.egress_manual_gb * 1073741824)::bigint; END IF;
    v_egress := GREATEST(v_tele + v_dl, v_manual);
    v_sq := s.storage_quota_gb; v_eq := s.egress_quota_gb;
    IF to_regclass('public.supabase_usage_metrics') IS NOT NULL THEN
        EXECUTE 'SELECT included_value FROM public.supabase_usage_metrics WHERE metric_name = $1' INTO v_q USING 'Armazenamento (Storage)';
        IF v_q IS NOT NULL AND v_q > 0 THEN v_sq := v_q; v_sq_src := 'financeiro'; END IF;
        v_q := NULL;
        EXECUTE 'SELECT included_value FROM public.supabase_usage_metrics WHERE metric_name = $1' INTO v_q USING 'Largura de banda (Egress)';
        IF v_q IS NOT NULL AND v_q > 0 THEN v_eq := v_q; v_eq_src := 'financeiro'; END IF;
    END IF;
    RETURN jsonb_build_object('cycle_start', v_cycle,
        'storage_bytes', v_storage, 'storage_quota_bytes', (v_sq * 1073741824)::bigint, 'storage_quota_source', v_sq_src, 'storage_pct', LEAST(999, round(v_storage * 100.0 / (v_sq * 1073741824)))::int,
        'egress_bytes', v_egress, 'egress_quota_bytes', (v_eq * 1073741824)::bigint, 'egress_quota_source', v_eq_src, 'egress_pct', LEAST(999, round(v_egress * 100.0 / (v_eq * 1073741824)))::int,
        'egress_parts', jsonb_build_object('telemetry', v_tele, 'downloads', v_dl, 'manual', v_manual));
END $$;
REVOKE ALL ON FUNCTION public._upload_valve_measure() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_download_bandwidth(p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 90); v_total bigint; v_n bigint; v_items jsonb; v_month_n bigint; v_month_total bigint;
BEGIN
    SELECT COALESCE(sum(c.size_bytes), 0)::bigint, count(*) INTO v_total, v_n
      FROM public.digital_downloads d JOIN public.digital_contents c ON c.id = d.item_id WHERE d.day > current_date - v_days;
    SELECT COALESCE(sum(c.size_bytes), 0)::bigint, count(*) INTO v_month_total, v_month_n
      FROM public.digital_downloads d JOIN public.digital_contents c ON c.id = d.item_id WHERE d.day >= date_trunc('month', current_date)::date;
    SELECT COALESCE(jsonb_agg(r ORDER BY r.est_bytes DESC), '[]'::jsonb) INTO v_items FROM (
        SELECT c.id AS item_id, p.id AS product_id, p.name AS product_name, s.name AS store_name, c.platform, c.version, COALESCE(c.size_bytes, 0) AS size_bytes,
               count(*) AS downloads, (COALESCE(c.size_bytes, 0) * count(*))::bigint AS est_bytes
          FROM public.digital_downloads d JOIN public.digital_contents c ON c.id = d.item_id JOIN public.products p ON p.id = c.product_id LEFT JOIN public.stores s ON s.id = p.store_id
         WHERE d.day > current_date - v_days GROUP BY c.id, p.id, s.name ORDER BY est_bytes DESC LIMIT 20) r;
    RETURN jsonb_build_object('days', v_days, 'downloads', v_n, 'est_bytes', v_total, 'month_downloads', v_month_n, 'month_est_bytes', v_month_total,
        'month_projection_bytes', CASE WHEN extract(day FROM current_date) > 0 THEN (v_month_total * 30 / extract(day FROM current_date))::bigint ELSE v_month_total END, 'items', v_items);
END $$;
REVOKE ALL ON FUNCTION public.admin_download_bandwidth(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_download_bandwidth(integer) TO service_role;
