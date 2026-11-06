-- Desfaz 20261130000020_upload_authorization.sql: volta as 5 políticas de INSERT do Storage às condições anteriores (sem a autorização), remove as funções, tabelas e colunas novas e
-- restaura register_media_asset como era na 20261130000019. Os arquivos no Storage NÃO são tocados. Se o código novo ainda estiver no ar, o pedido de autorização falha em silêncio e o
-- envio segue direto (o app trata "função inexistente" como "indisponível").

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'upload-grants-purge';

-- políticas de INSERT como estavam (20261106 e as migrations de flash, provas e digitais)
DROP POLICY IF EXISTS "storage_insert_flat" ON storage.objects;
CREATE POLICY "storage_insert_flat" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('avatars', 'backgrounds', 'mural-images', 'product-images', 'store-logos'));
DROP POLICY IF EXISTS "storage_insert_own_folder" ON storage.objects;
CREATE POLICY "storage_insert_own_folder" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('community-photos', 'driver-car-photos', 'driver-selfie-photos', 'posts',
                              'ride-object-photos', 'service-request-photos', 'store-links')
                AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "storage_insert_flash_media" ON storage.objects;
CREATE POLICY "storage_insert_flash_media" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'flash-media' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "storage_insert_delivery_proofs" ON storage.objects;
CREATE POLICY "storage_insert_delivery_proofs" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'delivery-proofs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "storage_insert_digital_files" ON storage.objects;
CREATE POLICY "storage_insert_digital_files" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'digital-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP FUNCTION IF EXISTS public.upload_grants_purge();
DROP FUNCTION IF EXISTS public.admin_upload_update_kind(text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.admin_upload_unblock(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_upload_block(uuid, text, text, integer, uuid);
DROP FUNCTION IF EXISTS public.admin_upload_set_enforced(boolean, uuid);
DROP FUNCTION IF EXISTS public.authorize_upload(text, text, bigint, text, boolean);
DROP FUNCTION IF EXISTS public._has_upload_grant(text, text);
DROP FUNCTION IF EXISTS public._direct_upload_allowed();

-- register_media_asset como na 20261130000019 (sem fechar a autorização)
CREATE OR REPLACE FUNCTION public.register_media_asset(p_bucket text, p_path text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE
    v_uid   uuid := auth.uid();
    v_kind  public.upload_kinds%ROWTYPE;
    v_owner text;
    v_meta  jsonb;
    v_id    uuid;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
    SELECT * INTO v_kind FROM public.upload_kinds WHERE bucket = p_bucket AND enabled ORDER BY kind LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT o.owner_id, o.metadata INTO v_owner, v_meta FROM storage.objects o WHERE o.bucket_id = p_bucket AND o.name = p_path;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF v_owner IS DISTINCT FROM v_uid::text THEN RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.media_assets (owner_id, kind, provider, bucket, key, bytes, mime)
    VALUES (v_uid, v_kind.kind, v_kind.provider, p_bucket, p_path, COALESCE((v_meta->>'size')::bigint, 0), v_meta->>'mimetype')
    ON CONFLICT (provider, bucket, key) DO UPDATE
        SET owner_id = EXCLUDED.owner_id, kind = EXCLUDED.kind, bytes = EXCLUDED.bytes, mime = EXCLUDED.mime, state = 'ready', deleted_at = NULL
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;

DROP TABLE IF EXISTS public.upload_grants;
DROP TABLE IF EXISTS public.upload_blocks;
DROP TABLE IF EXISTS public.upload_settings;
ALTER TABLE public.upload_kinds
    DROP COLUMN IF EXISTS owner_folder, DROP COLUMN IF EXISTS requires_plan, DROP COLUMN IF EXISTS per_hour_files,
    DROP COLUMN IF EXISTS per_day_bytes, DROP COLUMN IF EXISTS per_user_bytes, DROP COLUMN IF EXISTS grant_minutes;
