-- DIGITAL PESADO NO CLOUDFLARE R2 (bucket PRIVADO separado). Por quê: o que derruba o serviço é a BANDA de download do Supabase (5 GB/mês no plano grátis; 13,94 GB em outubro) e o
-- digital (vídeo-aula, música, programa) é o que mais baixa. O R2 não cobra saída de dados e tem 10 GB grátis. Aqui o arquivo do produto digital passa a poder morar no R2:
--   · tipo de envio novo `digital_heavy` ("Digital pesado (R2 privado)"), bucket lógico `iuser-digital` (nome real: variável R2_DIGITAL_BUCKET), provedor r2, NASCE DESLIGADO;
--   · o bucket do digital é PRIVADO e NUNCA divide bucket com o `iuser-media` (esse tem domínio público: conteúdo pago ali ficaria aberto). Ler = só link assinado, depois de get_digital_item_access;
--   · cada item de `digital_contents` pode estar em `bucket = 'iuser-digital'` (storage_path = a chave no R2). O banco TRAVA (digital_r2_guard): chave no formato do servidor, arquivo registrado em
--     media_assets (provedor r2, tipo digital_heavy, da MESMA pessoa, pronto) e usado por um item só — como o flashes_r2_guard do Flash;
--   · `digital_contents.file_name`: o nome original do arquivo (a chave no R2 é um uuid), para o download sair com o nome certo;
--   · release_r2_asset também confere os itens digitais; as contas de BANDA do Supabase (válvula e estimativa do Admin) deixam de contar o que está no R2.
-- Rollback: supabase/rollbacks/digital_r2_rollback.sql

-- ---------------------------------------------------------------- o tipo de envio (nasce DESLIGADO; valores PROPOSTOS, editáveis em Admin → Uploads)
INSERT INTO public.upload_kinds (kind, label, bucket, provider, max_bytes, mime_types, enabled, note, owner_folder, requires_plan, per_hour_files, per_day_bytes, per_user_bytes, grant_minutes, cleanup_eligible)
VALUES ('digital_heavy', 'Digital pesado (R2 privado)', 'iuser-digital', 'r2', 536870912,
        ARRAY['video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/webm','application/pdf','application/zip','image/jpeg','image/png','image/webp','image/gif','image/avif','application/octet-stream'], false,
        'Cloudflare R2, bucket PRIVADO separado do iuser-media (variável R2_DIGITAL_BUCKET). Aula, música, e-book, programa e pacote do produto digital. Sem cobrança de saída de dados. Ligue só depois de "Testar o R2 privado" em Admin → Uploads. Nunca entra na limpeza automática (conteúdo vendido).',
        true, false, 5, 2147483648, 3221225472, 180, false)
ON CONFLICT (kind) DO NOTHING;
-- fora da válvula: o R2 não conta na cota do Supabase (armazenamento e banda), então pausá-lo não protege nada; o admin pode mudar na tela
UPDATE public.upload_kinds SET valve_stage = NULL WHERE kind = 'digital_heavy';

-- ---------------------------------------------------------------- itens: bucket do R2, nome original e a trava
ALTER TABLE public.digital_contents ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_file_name_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_file_name_check CHECK (file_name IS NULL OR char_length(file_name) BETWEEN 1 AND 200);

ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_bucket_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_bucket_check CHECK (bucket IN ('digital-files', 'digital-music', 'digital-apps', 'iuser-digital'));
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_bucket_kind_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_bucket_kind_check CHECK (
    storage_path IS NULL
    OR (bucket = 'iuser-digital' AND kind <> 'link')
    OR (kind = 'audio' AND bucket = 'digital-music') OR (kind = 'app' AND bucket = 'digital-apps') OR (kind NOT IN ('audio', 'app') AND bucket = 'digital-files')) NOT VALID;

CREATE OR REPLACE FUNCTION public.digital_r2_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.bucket = 'iuser-digital') IS DISTINCT FROM (OLD.bucket = 'iuser-digital') THEN
        RAISE EXCEPTION 'O item não muda entre o armazenamento comum e o R2.' USING ERRCODE = '22023', HINT = 'r2_asset_required';
    END IF;
    IF NEW.bucket <> 'iuser-digital' THEN RETURN NEW; END IF;
    IF NEW.storage_path IS NULL OR NEW.storage_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,8}(\.gz)?$' THEN
        RAISE EXCEPTION 'Nome de arquivo do R2 inválido.' USING ERRCODE = '22023', HINT = 'r2_asset_required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.media_assets m WHERE m.provider = 'r2' AND m.bucket = 'iuser-digital' AND m.kind = 'digital_heavy' AND m.key = NEW.storage_path AND m.owner_id = NEW.owner_id AND m.state = 'ready') THEN
        RAISE EXCEPTION 'O arquivo não foi enviado por você ou ainda não foi confirmado.' USING ERRCODE = '22023', HINT = 'r2_asset_required';
    END IF;
    IF EXISTS (SELECT 1 FROM public.digital_contents c WHERE c.storage_path = NEW.storage_path AND c.id <> NEW.id) THEN
        RAISE EXCEPTION 'Este arquivo já está em outro item.' USING ERRCODE = '22023', HINT = 'r2_asset_required';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.digital_r2_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS digital_r2_guard ON public.digital_contents;
CREATE TRIGGER digital_r2_guard BEFORE INSERT OR UPDATE OF storage_path, bucket ON public.digital_contents FOR EACH ROW EXECUTE FUNCTION public.digital_r2_guard();

-- a rota /api/digital/open assina o link do bucket certo e baixa com o nome original
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
    RETURN jsonb_build_object('allowed', true, 'kind', c.kind, 'title', c.title, 'storage_path', c.storage_path, 'bucket', c.bucket, 'file_name', c.file_name, 'external_url', c.external_url, 'mime_type', c.mime_type);
END $$;

-- apagar o arquivo do R2 também confere os itens digitais (o flash já era conferido)
CREATE OR REPLACE FUNCTION public.release_r2_asset(p_owner uuid, p_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
    IF EXISTS (SELECT 1 FROM public.flashes f WHERE f.media_url = p_key) OR EXISTS (SELECT 1 FROM public.digital_contents c WHERE c.storage_path = p_key) THEN RETURN false; END IF;
    UPDATE public.media_assets SET state = 'deleted', deleted_at = now(), deleted_reason = 'owner'
    WHERE provider = 'r2' AND key = p_key AND owner_id = p_owner AND state = 'ready';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n > 0;
END; $$;
REVOKE ALL ON FUNCTION public.release_r2_asset(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_r2_asset(uuid, text) TO service_role;

-- ---------------------------------------------------------------- BANDA do Supabase: o que está no R2 não conta (saída de dados do R2 é grátis)
CREATE OR REPLACE FUNCTION public._upload_valve_measure() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.upload_valve_settings; v_cycle date; v_storage bigint; v_tele bigint; v_dl bigint; v_manual bigint := 0; v_egress bigint; v_sq numeric; v_eq numeric; v_sq_src text := 'valve'; v_eq_src text := 'valve'; v_q numeric;
BEGIN
    SELECT * INTO s FROM public.upload_valve_settings WHERE id;
    v_cycle := public._upload_valve_cycle_start(s.cycle_day);
    SELECT COALESCE(sum((metadata->>'size')::bigint), 0)::bigint INTO v_storage FROM storage.objects;
    SELECT COALESCE(sum(egress_bytes), 0)::bigint INTO v_tele FROM public.usage_telemetry_daily WHERE day >= v_cycle;
    SELECT COALESCE(sum(c.size_bytes), 0)::bigint INTO v_dl FROM public.digital_downloads d JOIN public.digital_contents c ON c.id = d.item_id WHERE d.day >= v_cycle AND c.bucket <> 'iuser-digital';
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
DECLARE v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 90); v_total bigint; v_n bigint; v_items jsonb; v_month_n bigint; v_month_total bigint; v_r2_month_n bigint; v_r2_month_total bigint;
BEGIN
    SELECT COALESCE(sum(c.size_bytes), 0)::bigint, count(*) INTO v_total, v_n
      FROM public.digital_downloads d JOIN public.digital_contents c ON c.id = d.item_id WHERE d.day > current_date - v_days AND c.bucket <> 'iuser-digital';
    SELECT COALESCE(sum(c.size_bytes), 0)::bigint, count(*) INTO v_month_total, v_month_n
      FROM public.digital_downloads d JOIN public.digital_contents c ON c.id = d.item_id WHERE d.day >= date_trunc('month', current_date)::date AND c.bucket <> 'iuser-digital';
    SELECT COALESCE(sum(c.size_bytes), 0)::bigint, count(*) INTO v_r2_month_total, v_r2_month_n
      FROM public.digital_downloads d JOIN public.digital_contents c ON c.id = d.item_id WHERE d.day >= date_trunc('month', current_date)::date AND c.bucket = 'iuser-digital';
    SELECT COALESCE(jsonb_agg(r ORDER BY r.est_bytes DESC), '[]'::jsonb) INTO v_items FROM (
        SELECT c.id AS item_id, p.id AS product_id, p.name AS product_name, s.name AS store_name, c.platform, c.version, COALESCE(c.size_bytes, 0) AS size_bytes,
               count(*) AS downloads, (COALESCE(c.size_bytes, 0) * count(*))::bigint AS est_bytes
          FROM public.digital_downloads d JOIN public.digital_contents c ON c.id = d.item_id JOIN public.products p ON p.id = c.product_id LEFT JOIN public.stores s ON s.id = p.store_id
         WHERE d.day > current_date - v_days AND c.bucket <> 'iuser-digital' GROUP BY c.id, p.id, s.name ORDER BY est_bytes DESC LIMIT 20) r;
    RETURN jsonb_build_object('days', v_days, 'downloads', v_n, 'est_bytes', v_total, 'month_downloads', v_month_n, 'month_est_bytes', v_month_total,
        'month_projection_bytes', CASE WHEN extract(day FROM current_date) > 0 THEN (v_month_total * 30 / extract(day FROM current_date))::bigint ELSE v_month_total END,
        'r2_month_downloads', v_r2_month_n, 'r2_month_bytes', v_r2_month_total, 'items', v_items);
END $$;
REVOKE ALL ON FUNCTION public.admin_download_bandwidth(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_download_bandwidth(integer) TO service_role;

-- Admin → Financeiro: nota do R2 (o bucket privado do digital)
UPDATE public.service_expenses
SET notes = notes || ' | 03/11/2026: segundo bucket R2 PRIVADO (iuser-digital, variável R2_DIGITAL_BUCKET) para o conteúdo vendido do produto digital (aula, música, programa), sem domínio público e sem cobrança de saída de dados. Tipo de envio digital_heavy.',
    updated_at = now()
WHERE service_name ILIKE '%cloudflare%' AND notes NOT LIKE '%iuser-digital%';
