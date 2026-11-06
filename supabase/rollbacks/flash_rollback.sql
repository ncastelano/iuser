-- Desfaz o Flash (migration 20261130000000). Apaga TODOS os flashes, curtidas e comentários de flash.
DROP FUNCTION IF EXISTS public.get_flash_feed(text, integer, timestamptz, text);
DROP FUNCTION IF EXISTS public.get_flash_feed(text, integer, timestamptz);
DROP FUNCTION IF EXISTS public.increment_flash_share_count(uuid);
DROP TABLE IF EXISTS public.flash_comments, public.flash_likes, public.flashes CASCADE;
DROP FUNCTION IF EXISTS public.flash_like_counter();
DROP FUNCTION IF EXISTS public.flash_comment_counter();
DROP FUNCTION IF EXISTS public.flash_rate_limit();
DROP POLICY IF EXISTS "storage_insert_flash_media" ON storage.objects;
-- (o bucket flash-media e os arquivos dele ficam: apague pelo painel do Storage se quiser)
