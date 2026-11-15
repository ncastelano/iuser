-- Desfaz 20261130000031_digital_limits_split.sql. Arquivos já enviados aos buckets novos (digital-music, digital-apps) ficam órfãos no Storage: mova-os para digital-files antes, se houver.
DROP FUNCTION IF EXISTS public.admin_download_bandwidth(integer);
DROP FUNCTION IF EXISTS public.get_my_upload_limits();
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
    RETURN jsonb_build_object('allowed', true, 'kind', c.kind, 'title', c.title, 'storage_path', c.storage_path, 'external_url', c.external_url, 'mime_type', c.mime_type);
END $$;
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_bucket_kind_check;
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_bucket_check;
ALTER TABLE public.digital_contents DROP COLUMN IF EXISTS bucket;
DELETE FROM public.media_assets WHERE kind IN ('digital_music', 'digital_app');
DELETE FROM public.upload_kinds WHERE kind IN ('digital_music', 'digital_app');
UPDATE public.upload_kinds SET label = 'Arquivo de produto digital', max_bytes = 524288000, per_hour_files = 20, per_day_bytes = 2147483648, per_user_bytes = 21474836480,
    note = 'bucket privado; no plano gratuito o teto global é 50 MB por arquivo' WHERE kind = 'digital_file';
UPDATE storage.buckets SET file_size_limit = 524288000 WHERE id = 'digital-files';
DO $$ DECLARE b text; n text; BEGIN
    FOREACH b IN ARRAY ARRAY['digital-music', 'digital-apps'] LOOP
        n := replace(b, '-', '_');
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'storage_insert_' || n);
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'storage_select_' || n);
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'storage_delete_' || n);
    END LOOP;
END $$;
DELETE FROM storage.buckets WHERE id IN ('digital-music', 'digital-apps') AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = storage.buckets.id);
