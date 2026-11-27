-- =====================================================================
-- CONVERSAS: vídeo e áudio (normal e de visualização única) — 19/11/2026
--
-- · direct_messages.kind passa a ser 'text' | 'photo' | 'video' | 'audio' | 'location'. A visualização única vira a COLUNA
--   `view_once` (vale para foto, vídeo e áudio). As mensagens antigas kind='view_once' viram kind='photo' + view_once=true.
-- · `media_seconds`: duração (vídeo até 60 s, áudio até 5 min), conferida no BANCO (não basta o navegador dizer).
-- · Tipos de envio novos no R2 PRIVADO do chat (iuser-chat), com limite de tamanho, ritmo e cota por dia/pessoa, para não estourar.
-- Rollback: supabase/rollbacks/chat_video_audio_rollback.sql
-- =====================================================================

-- ---------------------------------------------------------------- tipos de envio (nascem DESLIGADOS: ligar depois do teste do R2)
INSERT INTO public.upload_kinds (kind, label, bucket, provider, max_bytes, mime_types, enabled, note, owner_folder, requires_plan, per_hour_files, per_day_bytes, per_user_bytes, grant_minutes, cleanup_eligible)
VALUES
 ('chat_video', 'Vídeo de conversa (R2 privado)', 'iuser-chat', 'r2', 26214400,
  ARRAY['video/mp4','video/webm','video/quicktime'], false,
  'Vídeo nas conversas: até 25 MB e 1 minuto (o minuto é conferido no banco). Cloudflare R2 privado do chat.',
  true, false, 20, 524288000, 2147483648, 15, false),
 ('chat_audio', 'Áudio de conversa (R2 privado)', 'iuser-chat', 'r2', 5242880,
  ARRAY['audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/aac'], false,
  'Áudio gravado na conversa: até 5 MB e 5 minutos (conferido no banco). Cloudflare R2 privado do chat.',
  true, false, 60, 209715200, 1073741824, 15, false)
ON CONFLICT (kind) DO NOTHING;
UPDATE public.upload_kinds SET valve_stage = NULL WHERE kind IN ('chat_video', 'chat_audio');

-- ---------------------------------------------------------------- colunas e migração dos dados antigos
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS view_once boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS media_seconds integer;
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_media_shape_check;
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_kind_check;
UPDATE public.direct_messages SET kind = 'photo', view_once = true WHERE kind = 'view_once';
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_kind_check CHECK (kind IN ('text','photo','video','audio','location'));
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_media_shape_check CHECK (
  (kind IN ('text','location') AND media_key IS NULL AND NOT view_once AND media_seconds IS NULL)
  OR (kind IN ('photo','video','audio') AND media_key IS NOT NULL AND media_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'
      AND (kind <> 'photo' OR media_seconds IS NULL)
      AND (kind <> 'video' OR media_seconds BETWEEN 1 AND 60)
      AND (kind <> 'audio' OR media_seconds BETWEEN 1 AND 300))
);

-- ---------------------------------------------------------------- trava: arquivo CONFIRMADO da própria pessoa, do tipo certo
CREATE OR REPLACE FUNCTION public.direct_messages_media_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kind text;
BEGIN
    IF NEW.kind NOT IN ('photo','video','audio') THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND NEW.media_key IS DISTINCT FROM OLD.media_key THEN
        RAISE EXCEPTION 'O arquivo de uma mensagem não muda.' USING ERRCODE = '22023', HINT = 'chat_media_required';
    END IF;
    v_kind := CASE NEW.kind WHEN 'photo' THEN 'chat_media' WHEN 'video' THEN 'chat_video' ELSE 'chat_audio' END;
    IF NOT EXISTS (SELECT 1 FROM public.media_assets m
                    WHERE m.provider = 'r2' AND m.bucket = 'iuser-chat' AND m.kind = v_kind
                      AND m.key = NEW.media_key AND m.owner_id = NEW.sender_id AND m.state = 'ready') THEN
        RAISE EXCEPTION 'O arquivo não foi enviado por você ou ainda não foi confirmado.' USING ERRCODE = '22023', HINT = 'chat_media_required';
    END IF;
    IF EXISTS (SELECT 1 FROM public.direct_messages d WHERE d.media_key = NEW.media_key AND d.id <> NEW.id) THEN
        RAISE EXCEPTION 'Este arquivo já foi usado em outra mensagem.' USING ERRCODE = '22023', HINT = 'chat_media_required';
    END IF;
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------- enviar (a versão de 4 parâmetros sai: a nova tem os extras)
DROP FUNCTION IF EXISTS public.chat_send_media(uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.chat_send_media(p_conv uuid, p_kind text, p_key text, p_caption text DEFAULT '',
                                                  p_once boolean DEFAULT false, p_seconds integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_id uuid; v_text text;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para enviar.' USING ERRCODE = '42501'; END IF;
    IF p_kind NOT IN ('photo','video','audio') THEN RAISE EXCEPTION 'Tipo de mídia inválido.' USING ERRCODE = '22023'; END IF;
    IF p_kind = 'video' AND (p_seconds IS NULL OR p_seconds < 1 OR p_seconds > 60) THEN
        RAISE EXCEPTION 'Vídeo: no máximo 1 minuto.' USING ERRCODE = '22023', HINT = 'chat_media_limit';
    END IF;
    IF p_kind = 'audio' AND (p_seconds IS NULL OR p_seconds < 1 OR p_seconds > 300) THEN
        RAISE EXCEPTION 'Áudio: no máximo 5 minutos.' USING ERRCODE = '22023', HINT = 'chat_media_limit';
    END IF;
    IF p_kind = 'photo' THEN p_seconds := NULL; END IF;
    IF NOT public._can_access_conversation(p_conv, v_me) THEN RAISE EXCEPTION 'Esta conversa não é sua.' USING ERRCODE = '42501'; END IF;
    v_text := left(coalesce(nullif(btrim(p_caption), ''), CASE p_kind WHEN 'video' THEN 'Vídeo' WHEN 'audio' THEN 'Áudio' ELSE 'Foto' END), 500);
    INSERT INTO public.direct_messages (conversation_id, sender_id, content, kind, media_key, view_once, media_seconds)
    VALUES (p_conv, v_me, v_text, p_kind, p_key, coalesce(p_once, false), p_seconds)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- ---------------------------------------------------------------- abrir a visualização única (UMA vez, só quem recebeu)
CREATE OR REPLACE FUNCTION public.chat_open_view_once(p_msg uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); r public.direct_messages%ROWTYPE;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
    SELECT * INTO r FROM public.direct_messages WHERE id = p_msg FOR UPDATE;
    IF NOT FOUND OR NOT r.view_once OR r.kind NOT IN ('photo','video','audio') THEN
        RAISE EXCEPTION 'Mídia não encontrada.' USING ERRCODE = '42501';
    END IF;
    IF r.sender_id = v_me OR NOT public._can_access_conversation(r.conversation_id, v_me) THEN
        RAISE EXCEPTION 'Só quem recebeu pode abrir.' USING ERRCODE = '42501', HINT = 'view_once_recipient_only';
    END IF;
    IF r.viewed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Esta mídia já foi visualizada.' USING ERRCODE = '22023', HINT = 'view_once_used';
    END IF;
    UPDATE public.direct_messages SET viewed_at = now() WHERE id = p_msg;
    RETURN r.media_key;
END $$;

REVOKE ALL ON FUNCTION public.chat_send_media(uuid, text, text, text, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_send_media(uuid, text, text, text, boolean, integer) TO authenticated;
