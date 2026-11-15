-- Flash com vídeo no Cloudflare R2 (depende da 20261130000023). Um flash com vídeo pesado guarda em `media_url` a CHAVE do arquivo no R2 (`<id da pessoa>/<uuid>.mp4`),
-- em vez do caminho do Supabase (`<id da pessoa>/<ms>-<código>.<ext>`). A diferença é só o nome: o arquivo do R2 sempre se chama <uuid>.<mp4|webm|mov> (o servidor escolhe o nome;
-- /api/uploads/r2/sign). Não há coluna nova nem mudança em get_flash_feed: o app reconhece a chave do R2 pelo formato do nome (modules/flash/domain.ts isR2Key).
--
-- O banco garante que ninguém aponte um flash para um arquivo que não é dele ou nunca foi enviado: um flash cujo nome de arquivo tem o formato do R2 só entra se existir, em media_assets,
-- um registro do R2 (tipo media_r2) desta mesma pessoa, pronto, e que nenhum outro flash use. Sem isso o gatilho recusa (HINT r2_asset_required).
-- release_r2_asset (só serviço) marca o arquivo como apagado quando a pessoa apaga o flash; quem apaga o objeto no R2 é a rota /api/uploads/r2/remove.
-- Rollback: supabase/rollbacks/flash_r2_rollback.sql

CREATE OR REPLACE FUNCTION public.flashes_r2_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.media_url IS NULL OR split_part(NEW.media_url, '/', 2) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm|mov)$' THEN
        RETURN NEW;   -- nome comum do Supabase: nada a conferir aqui
    END IF;
    IF NEW.media_type IS DISTINCT FROM 'video' THEN
        RAISE EXCEPTION 'Arquivo do R2 só vale para vídeo.' USING ERRCODE = '22023', HINT = 'r2_asset_required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.media_assets m WHERE m.provider = 'r2' AND m.kind = 'media_r2' AND m.key = NEW.media_url AND m.owner_id = NEW.author_id AND m.state = 'ready') THEN
        RAISE EXCEPTION 'O vídeo não foi enviado por você ou ainda não foi confirmado.' USING ERRCODE = '22023', HINT = 'r2_asset_required';
    END IF;
    IF EXISTS (SELECT 1 FROM public.flashes f WHERE f.media_url = NEW.media_url) THEN
        RAISE EXCEPTION 'Este vídeo já está em outro flash.' USING ERRCODE = '22023', HINT = 'r2_asset_required';
    END IF;
    RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.flashes_r2_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS flashes_r2_guard ON public.flashes;
CREATE TRIGGER flashes_r2_guard BEFORE INSERT ON public.flashes FOR EACH ROW EXECUTE FUNCTION public.flashes_r2_guard();

-- Marca o arquivo do R2 como apagado, se é da pessoa e nenhum flash o usa mais. Devolve true quando marcou (o servidor então apaga o objeto no R2).
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
