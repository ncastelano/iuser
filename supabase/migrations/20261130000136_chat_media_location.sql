-- =====================================================================
-- CONVERSAS (diretas): foto, foto de visualização única e localização ao vivo (19/11/2026)
--
-- · direct_messages ganha: kind ('text'|'photo'|'view_once'|'location'), media_key (chave no R2 PRIVADO iuser-chat),
--   viewed_at (a visualização única marca UMA vez) e a localização (loc_*). Mensagem de texto segue igual.
-- · Foto e foto de visualização única vão ao R2 PRIVADO do chat (bucket R2_CHAT_BUCKET, nome lógico `iuser-chat`), SEM domínio
--   público e SEM o armazenamento do Supabase (cota de banda). Só o servidor assina o link, depois de conferir a conversa.
-- · Localização: a pessoa escolhe 15 min, 1 h ou "até desligar" (máx. 8 h, teto de `loc_expires_at`); só quem enviou atualiza.
-- Rollback: supabase/rollbacks/chat_media_location_rollback.sql
-- =====================================================================

-- ---------------------------------------------------------------- tipo de envio (nasce ligado só depois do teste do R2)
INSERT INTO public.upload_kinds (kind, label, bucket, provider, max_bytes, mime_types, enabled, note, owner_folder, requires_plan, per_hour_files, per_day_bytes, per_user_bytes, grant_minutes, cleanup_eligible)
VALUES ('chat_media', 'Foto de conversa (R2 privado)', 'iuser-chat', 'r2', 10485760,
        ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'], false,
        'Cloudflare R2, bucket PRIVADO do chat (variável R2_CHAT_BUCKET), sem domínio público. Fotos e fotos de visualização única das conversas. Ligue depois de "Testar o R2 privado" em Admin → Uploads.',
        true, false, 60, 314572800, 1073741824, 15, false)
ON CONFLICT (kind) DO NOTHING;
UPDATE public.upload_kinds SET valve_stage = NULL WHERE kind = 'chat_media';

-- ---------------------------------------------------------------- colunas da mensagem
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_key text,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS loc_lat double precision,
  ADD COLUMN IF NOT EXISTS loc_lng double precision,
  ADD COLUMN IF NOT EXISTS loc_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS loc_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS loc_stopped boolean NOT NULL DEFAULT false;

ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_kind_check;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_kind_check CHECK (kind IN ('text','photo','view_once','location'));

-- foto: só com chave no formato do servidor (<uid>/<uuid>.<ext>); localização: só com coordenadas válidas
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_media_shape_check;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_media_shape_check CHECK (
  (kind IN ('text','location') AND media_key IS NULL)
  OR (kind IN ('photo','view_once') AND media_key IS NOT NULL AND media_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$')
);
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_loc_range_check;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_loc_range_check CHECK (
  loc_lat IS NULL OR (loc_lat BETWEEN -90 AND 90 AND loc_lng BETWEEN -180 AND 180)
);

-- ---------------------------------------------------------------- trava: a foto precisa ser um arquivo CONFIRMADO da própria pessoa
CREATE OR REPLACE FUNCTION public.direct_messages_media_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.kind NOT IN ('photo','view_once') THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND NEW.media_key IS DISTINCT FROM OLD.media_key THEN
        RAISE EXCEPTION 'A foto de uma mensagem não muda.' USING ERRCODE = '22023', HINT = 'chat_media_required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.media_assets m
                    WHERE m.provider = 'r2' AND m.bucket = 'iuser-chat' AND m.kind = 'chat_media'
                      AND m.key = NEW.media_key AND m.owner_id = NEW.sender_id AND m.state = 'ready') THEN
        RAISE EXCEPTION 'A foto não foi enviada por você ou ainda não foi confirmada.' USING ERRCODE = '22023', HINT = 'chat_media_required';
    END IF;
    IF EXISTS (SELECT 1 FROM public.direct_messages d WHERE d.media_key = NEW.media_key AND d.id <> NEW.id) THEN
        RAISE EXCEPTION 'Esta foto já foi usada em outra mensagem.' USING ERRCODE = '22023', HINT = 'chat_media_required';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.direct_messages_media_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS direct_messages_media_guard ON public.direct_messages;
CREATE TRIGGER direct_messages_media_guard BEFORE INSERT OR UPDATE ON public.direct_messages
    FOR EACH ROW EXECUTE FUNCTION public.direct_messages_media_guard();

-- ---------------------------------------------------------------- enviar foto (normal ou visualização única)
CREATE OR REPLACE FUNCTION public.chat_send_media(p_conv uuid, p_kind text, p_key text, p_caption text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_id uuid;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para enviar.' USING ERRCODE = '42501'; END IF;
    IF p_kind NOT IN ('photo','view_once') THEN RAISE EXCEPTION 'Tipo de mídia inválido.' USING ERRCODE = '22023'; END IF;
    IF NOT public._can_access_conversation(p_conv, v_me) THEN RAISE EXCEPTION 'Esta conversa não é sua.' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.direct_messages (conversation_id, sender_id, content, kind, media_key)
    VALUES (p_conv, v_me, left(coalesce(nullif(btrim(p_caption), ''), CASE WHEN p_kind = 'view_once' THEN 'Foto de visualização única' ELSE 'Foto' END), 500), p_kind, p_key)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- ---------------------------------------------------------------- abrir a visualização única: UMA vez, só quem recebeu
CREATE OR REPLACE FUNCTION public.chat_open_view_once(p_msg uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); r public.direct_messages%ROWTYPE;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
    SELECT * INTO r FROM public.direct_messages WHERE id = p_msg FOR UPDATE;
    IF NOT FOUND OR r.kind <> 'view_once' THEN RAISE EXCEPTION 'Foto não encontrada.' USING ERRCODE = '42501'; END IF;
    IF r.sender_id = v_me OR NOT public._can_access_conversation(r.conversation_id, v_me) THEN
        RAISE EXCEPTION 'Só quem recebeu pode abrir.' USING ERRCODE = '42501', HINT = 'view_once_recipient_only';
    END IF;
    IF r.viewed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Esta foto já foi visualizada.' USING ERRCODE = '22023', HINT = 'view_once_used';
    END IF;
    UPDATE public.direct_messages SET viewed_at = now() WHERE id = p_msg;
    RETURN r.media_key;
END $$;

-- ---------------------------------------------------------------- localização ao vivo
CREATE OR REPLACE FUNCTION public.chat_start_location(p_conv uuid, p_minutes int, p_lat double precision, p_lng double precision)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_id uuid;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
    IF p_minutes NOT IN (15, 60, 480) THEN RAISE EXCEPTION 'Tempo inválido.' USING ERRCODE = '22023'; END IF;
    IF NOT public._can_access_conversation(p_conv, v_me) THEN RAISE EXCEPTION 'Esta conversa não é sua.' USING ERRCODE = '42501'; END IF;
    IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
        RAISE EXCEPTION 'Localização inválida.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.direct_messages (conversation_id, sender_id, content, kind, loc_lat, loc_lng, loc_updated_at, loc_expires_at)
    VALUES (p_conv, v_me, 'Localização ao vivo', 'location', p_lat, p_lng, now(), now() + make_interval(mins => p_minutes))
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.chat_update_location(p_msg uuid, p_lat double precision, p_lng double precision)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); n int;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
    IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
        RAISE EXCEPTION 'Localização inválida.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.direct_messages SET loc_lat = p_lat, loc_lng = p_lng, loc_updated_at = now()
     WHERE id = p_msg AND kind = 'location' AND sender_id = v_me AND NOT loc_stopped AND loc_expires_at > now();
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n = 1;
END $$;

CREATE OR REPLACE FUNCTION public.chat_stop_location(p_msg uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); n int;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
    UPDATE public.direct_messages SET loc_stopped = true, loc_expires_at = now()
     WHERE id = p_msg AND kind = 'location' AND sender_id = v_me;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n = 1;
END $$;

REVOKE ALL ON FUNCTION public.chat_send_media(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_open_view_once(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_start_location(uuid, int, double precision, double precision) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_update_location(uuid, double precision, double precision) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_stop_location(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_send_media(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_open_view_once(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_start_location(uuid, int, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_update_location(uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_stop_location(uuid) TO authenticated;
