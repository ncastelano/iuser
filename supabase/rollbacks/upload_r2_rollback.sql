-- Desfaz 20261130000023_upload_r2.sql: a autorização volta a recusar tipos que não são do Supabase (wrong_provider), some o tipo media_r2 e a função de registro do R2.
-- Os ARQUIVOS no R2 não são tocados (apague no painel da Cloudflare se quiser) e a nota do Cloudflare em Admin → Financeiro fica como está. O registro (media_assets) e as autorizações do R2 são apagados.
DO $$
DECLARE v_def text;
BEGIN
    v_def := pg_get_functiondef('public._authorize_upload_core(text,text,bigint,text,boolean)'::regprocedure);
    IF position('k.provider NOT IN (''supabase'', ''r2'')' IN v_def) > 0 THEN
        v_def := replace(v_def, 'k.provider NOT IN (''supabase'', ''r2'')', 'k.provider <> ''supabase''');
        v_def := replace(v_def, 'FROM storage.objects o WHERE k.provider = ''supabase'' AND o.bucket_id = p_bucket AND o.name = p_path;', 'FROM storage.objects o WHERE o.bucket_id = p_bucket AND o.name = p_path;');
        EXECUTE v_def;
    END IF;
END $$;

DROP FUNCTION IF EXISTS public.register_r2_asset(uuid, text, text, bigint, text);
DELETE FROM public.upload_grants WHERE kind IN (SELECT kind FROM public.upload_kinds WHERE provider = 'r2');
DELETE FROM public.media_assets WHERE provider = 'r2';
DELETE FROM public.upload_blocks WHERE kind IN (SELECT kind FROM public.upload_kinds WHERE provider = 'r2');
DELETE FROM public.upload_denials WHERE kind IN (SELECT kind FROM public.upload_kinds WHERE provider = 'r2');
DELETE FROM public.upload_kinds WHERE provider = 'r2';
