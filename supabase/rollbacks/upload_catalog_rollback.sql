-- Desfaz 20261130000019_upload_catalog.sql: remove o registro e o catálogo de uploads. Os arquivos no Storage NÃO são tocados.
-- Se o código novo ainda estiver no ar, as chamadas a register_media_asset passam a falhar em silêncio (o envio nunca depende delas).
DROP FUNCTION IF EXISTS public.media_assets_reconcile();
DROP FUNCTION IF EXISTS public.my_media_usage();
DROP FUNCTION IF EXISTS public.register_media_asset(text, text);
DROP TABLE IF EXISTS public.media_assets;
DROP TABLE IF EXISTS public.upload_kinds;
