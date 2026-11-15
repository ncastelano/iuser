-- Desfaz 20261130000024_flash_r2.sql: some a trava dos flashes com vídeo do R2 e a função de liberar o arquivo. Flashes que já apontam para o R2 continuam no banco (o vídeo some do feed
-- se o app voltar a uma versão sem suporte ao R2); apague-os antes de reverter se for o caso.
DROP TRIGGER IF EXISTS flashes_r2_guard ON public.flashes;
DROP FUNCTION IF EXISTS public.flashes_r2_guard();
DROP FUNCTION IF EXISTS public.release_r2_asset(uuid, text);
