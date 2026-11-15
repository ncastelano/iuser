-- Desfaz 20261130000029_store_tips.sql (gorjeta / apoiar o artista). Apaga os apoios registrados.
DROP FUNCTION IF EXISTS public.set_store_tips_enabled(uuid, boolean);
DROP FUNCTION IF EXISTS public.get_store_tips_panel(uuid);
DROP FUNCTION IF EXISTS public.resolve_store_tip(uuid, boolean);
DROP FUNCTION IF EXISTS public.report_store_tip_paid(uuid);
DROP FUNCTION IF EXISTS public.create_store_tip(uuid, integer, uuid, text);
DROP FUNCTION IF EXISTS public.get_store_tips_info(uuid);
DROP TABLE IF EXISTS public.store_tips;
DROP TABLE IF EXISTS public.store_tip_settings;
