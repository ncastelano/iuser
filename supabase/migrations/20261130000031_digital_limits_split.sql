-- LIMITES DO DIGITAL, PROVISÓRIOS E SEPARADOS POR TIPO (música / programa / curso, e-book e arquivos) + "MEU ESPAÇO" + ESTIMATIVA DE BANDA.
-- Por quê: o digital tinha UMA cota só (500 MB por arquivo e 20 GB por pessoa) — grande demais para o plano gratuito do Supabase (arquivo de até 50 MB, 1 GB de armazenamento e,
-- principalmente, 5 GB de BANDA de download por mês; em outubro 13,94 GB de banda bloquearam o projeto inteiro) e misturando coisas diferentes. Agora são 3 "baterias":
--   digital_music  → bucket `digital-music`  (privado): até 25 MB por arquivo, 20/hora, 200 MB/dia, 500 MB por pessoa
--   digital_app    → bucket `digital-apps`   (privado): até 50 MB por arquivo, 10/hora, 200 MB/dia, 500 MB por pessoa
--   digital_file   → bucket `digital-files`  (privado, o de antes): até 50 MB por arquivo, 20/hora, 300 MB/dia, 500 MB por pessoa (vídeo-aula, e-book, planilha, material)
-- São valores PROVISÓRIOS para o plano gratuito. Depois do plano pago e do R2 para o digital pesado, sobem em Admin → Uploads (a mudança de `max_bytes` atualiza o bucket junto).
-- Cada item de `digital_contents` passa a saber em que bucket está (`bucket`): áudio novo → digital-music, programa novo → digital-apps, o resto → digital-files; as linhas antigas
-- ficam como estavam (digital-files). `get_digital_item_access` devolve o bucket para a rota assinar o link. Também:
--   · get_my_upload_limits()      — o "MEU ESPAÇO" da pessoa: por tipo, o limite por arquivo/hora/dia/total e quanto ela já usou (total e nas últimas 24 h);
--   · admin_download_bandwidth(d) — ESTIMATIVA de banda dos downloads de PROGRAMAS (tamanho × downloads contados), por item, nos últimos d dias, com projeção do mês (só o servidor).
-- Rollback: supabase/rollbacks/digital_limits_split_rollback.sql

-- ---------------------------------------------------------------- buckets e políticas do Storage (privados, pasta própria, com a autorização de envio)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
    ('digital-music', 'digital-music', false, 26214400, NULL),
    ('digital-apps',  'digital-apps',  false, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;
UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'digital-files';

DO $$
DECLARE b text; n text;
BEGIN
    FOREACH b IN ARRAY ARRAY['digital-music', 'digital-apps'] LOOP
        n := replace(b, '-', '_');
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'storage_insert_' || n);
        EXECUTE format($f$CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated
            WITH CHECK (bucket_id = %L AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (public._direct_upload_allowed() OR public._has_upload_grant(bucket_id, name)))$f$, 'storage_insert_' || n, b);
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'storage_select_' || n);
        EXECUTE format($f$CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)$f$, 'storage_select_' || n, b);
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'storage_delete_' || n);
        EXECUTE format($f$CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)$f$, 'storage_delete_' || n, b);
    END LOOP;
END $$;

-- ---------------------------------------------------------------- o catálogo de limites (Admin → Uploads edita)
INSERT INTO public.upload_kinds (kind, label, bucket, provider, max_bytes, mime_types, enabled, note, owner_folder, requires_plan, per_hour_files, per_day_bytes, per_user_bytes, grant_minutes, cleanup_eligible) VALUES
    ('digital_music', 'Música (produto digital)', 'digital-music', 'supabase', 26214400, NULL, true, 'Bucket privado. Limite provisório do plano gratuito; música pesada vai para o R2 quando houver plano pago.', true, false, 20, 209715200, 524288000, 180, false),
    ('digital_app',   'Programa ou aplicativo (produto digital)', 'digital-apps', 'supabase', 52428800, NULL, true, 'Bucket privado. Limite provisório do plano gratuito (teto global de 50 MB por arquivo); programas grandes vão para o R2.', true, false, 10, 209715200, 524288000, 180, false)
ON CONFLICT (kind) DO UPDATE SET label = EXCLUDED.label, bucket = EXCLUDED.bucket, max_bytes = EXCLUDED.max_bytes, per_hour_files = EXCLUDED.per_hour_files, per_day_bytes = EXCLUDED.per_day_bytes,
    per_user_bytes = EXCLUDED.per_user_bytes, note = EXCLUDED.note, owner_folder = EXCLUDED.owner_folder, grant_minutes = EXCLUDED.grant_minutes;
UPDATE public.upload_kinds SET label = 'Curso, e-book e arquivos (produto digital)', max_bytes = 52428800, per_hour_files = 20, per_day_bytes = 314572800, per_user_bytes = 524288000,
    note = 'Bucket privado. Limite provisório do plano gratuito (vídeo-aula pesada: use um link externo ou espere o R2).' WHERE kind = 'digital_file';

-- ---------------------------------------------------------------- cada item sabe em que bucket está
ALTER TABLE public.digital_contents ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'digital-files';
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_bucket_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_bucket_check CHECK (bucket IN ('digital-files', 'digital-music', 'digital-apps'));
-- o que ENTRA daqui para frente segue o tipo (NOT VALID: as linhas de antes, todas em digital-files, não são conferidas)
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_bucket_kind_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_bucket_kind_check CHECK (
    storage_path IS NULL OR (kind = 'audio' AND bucket = 'digital-music') OR (kind = 'app' AND bucket = 'digital-apps') OR (kind NOT IN ('audio', 'app') AND bucket = 'digital-files')) NOT VALID;

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

-- ---------------------------------------------------------------- MEU ESPAÇO: limites e uso de quem está logado
CREATE OR REPLACE FUNCTION public.get_my_upload_limits()
RETURNS TABLE (kind text, label text, bucket text, provider text, enabled boolean, max_bytes bigint, per_hour_files integer, per_day_bytes bigint, per_user_bytes bigint,
               used_bytes bigint, used_files bigint, used_day_bytes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT k.kind, k.label, k.bucket, k.provider, k.enabled, k.max_bytes, k.per_hour_files, k.per_day_bytes, k.per_user_bytes,
           COALESCE(sum(m.bytes) FILTER (WHERE m.state = 'ready'), 0)::bigint,
           (count(m.id) FILTER (WHERE m.state = 'ready'))::bigint,
           COALESCE(sum(m.bytes) FILTER (WHERE m.state = 'ready' AND m.created_at > now() - interval '24 hours'), 0)::bigint
      FROM public.upload_kinds k
      LEFT JOIN public.media_assets m ON m.kind = k.kind AND m.owner_id = auth.uid()
     WHERE auth.uid() IS NOT NULL
     GROUP BY k.kind
     ORDER BY k.label;
$$;
REVOKE ALL ON FUNCTION public.get_my_upload_limits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_upload_limits() TO authenticated;

-- ---------------------------------------------------------------- ESTIMATIVA DE BANDA dos programas (só o servidor)
-- Conta 1 download por pessoa por dia por item (digital_downloads); a banda estimada é tamanho × downloads. Música tocada e aula assistida NÃO entram (não há contagem).
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
