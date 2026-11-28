-- =====================================================================
-- CONVERSAS: apagar, responder, reagir, editar (15 min) e visto — 27/11/2026
--
-- · direct_messages ganha: reply_to_id (resposta citando outra mensagem da MESMA conversa),
--   edited_at (editada), deleted_at (apagada para todos: conteúdo e mídia são limpos).
-- · message_reactions: uma reação por pessoa e mensagem (6 emojis fixos). Escrita só por chat_react.
-- · direct_message_hidden: "apagar para mim" (só some para quem apagou).
-- · chat_delete_message: para todos só quem enviou, em até 48 h. Para mim, qualquer participante.
-- · chat_edit_message: só texto puro de quem enviou, em até 15 min, sem mensagem apagada.
-- · chat_other_read_at: quando a outra pessoa leu a conversa (✓✓ azul). Só lê last_read_at.
-- Rollback: supabase/rollbacks/chat_message_actions_rollback.sql
-- =====================================================================

-- ---------------------------------------------------------------- colunas novas
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.direct_messages(id) ON DELETE SET NULL;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS direct_messages_reply_idx ON public.direct_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;

-- o conteúdo pode ficar vazio só quando a mensagem foi apagada para todos
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_content_check;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_content_check CHECK (
    deleted_at IS NOT NULL OR char_length(btrim(content)) BETWEEN 1 AND 2000
);

-- a forma da mídia: apagada para todos pode ficar sem arquivo (o resto segue as regras de sempre)
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_media_shape_check;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_media_shape_check CHECK (
    deleted_at IS NOT NULL
    OR (kind IN ('text','location') AND media_key IS NULL AND NOT view_once AND media_seconds IS NULL)
    OR (kind IN ('photo','video','audio') AND media_key IS NOT NULL AND media_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'
        AND (kind <> 'photo' OR media_seconds IS NULL)
        AND (kind <> 'video' OR media_seconds BETWEEN 1 AND 60)
        AND (kind <> 'audio' OR media_seconds BETWEEN 1 AND 300))
);

-- trava de arquivo: mensagem apagada para todos sai da regra (o arquivo foi limpo de propósito)
CREATE OR REPLACE FUNCTION public.direct_messages_media_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kind text;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
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
REVOKE ALL ON FUNCTION public.direct_messages_media_guard() FROM PUBLIC, anon, authenticated;

-- resposta só para mensagem da MESMA conversa
CREATE OR REPLACE FUNCTION public.direct_messages_reply_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.direct_messages r WHERE r.id = NEW.reply_to_id AND r.conversation_id = NEW.conversation_id
    ) THEN
        RAISE EXCEPTION 'A mensagem respondida não está nesta conversa.' USING ERRCODE = '22023', HINT = 'reply_not_in_conversation';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.direct_messages_reply_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS direct_messages_reply_guard ON public.direct_messages;
CREATE TRIGGER direct_messages_reply_guard BEFORE INSERT ON public.direct_messages
    FOR EACH ROW EXECUTE FUNCTION public.direct_messages_reply_guard();

-- ---------------------------------------------------------------- reações
CREATE TABLE IF NOT EXISTS public.message_reactions (
    message_id uuid NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    emoji text NOT NULL CHECK (emoji IN ('👍','❤️','😂','😮','😢','🙏')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, profile_id)
);
CREATE INDEX IF NOT EXISTS message_reactions_conv_idx ON public.message_reactions (conversation_id);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
REVOKE ALL ON public.message_reactions FROM anon, authenticated;
GRANT SELECT ON public.message_reactions TO authenticated;
DROP POLICY IF EXISTS "Participantes veem as reações" ON public.message_reactions;
CREATE POLICY "Participantes veem as reações" ON public.message_reactions FOR SELECT TO authenticated
    USING (public._can_access_conversation(conversation_id, auth.uid()));

-- ---------------------------------------------------------------- apagar para mim
CREATE TABLE IF NOT EXISTS public.direct_message_hidden (
    message_id uuid NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, profile_id)
);
ALTER TABLE public.direct_message_hidden ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_message_hidden FROM anon, authenticated;
GRANT SELECT ON public.direct_message_hidden TO authenticated;
DROP POLICY IF EXISTS "Cada um vê as próprias ocultas" ON public.direct_message_hidden;
CREATE POLICY "Cada um vê as próprias ocultas" ON public.direct_message_hidden FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

-- ---------------------------------------------------------------- funções
CREATE OR REPLACE FUNCTION public.chat_react(p_msg uuid, p_emoji text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_conv uuid; v_deleted timestamptz;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
    SELECT conversation_id, deleted_at INTO v_conv, v_deleted FROM public.direct_messages WHERE id = p_msg;
    IF NOT FOUND OR v_deleted IS NOT NULL OR NOT public._can_access_conversation(v_conv, v_me) THEN
        RAISE EXCEPTION 'Mensagem não encontrada.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.message_reactions WHERE message_id = p_msg AND profile_id = v_me AND emoji = p_emoji) THEN
        DELETE FROM public.message_reactions WHERE message_id = p_msg AND profile_id = v_me;
        RETURN NULL; -- tocar de novo no mesmo emoji tira a reação
    END IF;
    INSERT INTO public.message_reactions (message_id, conversation_id, profile_id, emoji)
    VALUES (p_msg, v_conv, v_me, p_emoji)
    ON CONFLICT (message_id, profile_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now();
    RETURN p_emoji;
END $$;
REVOKE ALL ON FUNCTION public.chat_react(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_react(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.chat_delete_message(p_msg uuid, p_for_all boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); r public.direct_messages%ROWTYPE;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
    SELECT * INTO r FROM public.direct_messages WHERE id = p_msg FOR UPDATE;
    IF NOT FOUND OR NOT public._can_access_conversation(r.conversation_id, v_me) THEN
        RAISE EXCEPTION 'Mensagem não encontrada.' USING ERRCODE = '42501';
    END IF;
    IF NOT coalesce(p_for_all, false) THEN
        INSERT INTO public.direct_message_hidden (message_id, profile_id) VALUES (p_msg, v_me)
        ON CONFLICT DO NOTHING;
        RETURN;
    END IF;
    IF r.sender_id <> v_me THEN
        RAISE EXCEPTION 'Só quem enviou pode apagar para todos.' USING ERRCODE = '42501', HINT = 'delete_sender_only';
    END IF;
    IF r.deleted_at IS NOT NULL THEN RETURN; END IF;
    IF r.created_at < now() - interval '48 hours' THEN
        RAISE EXCEPTION 'Passou o prazo para apagar para todos (48 h).' USING ERRCODE = '22023', HINT = 'delete_too_old';
    END IF;
    -- o arquivo (foto, vídeo, áudio) sai da mensagem; o objeto no R2 é recolhido pela limpeza de órfãos
    UPDATE public.direct_messages
       SET deleted_at = now(), content = '', media_key = NULL, view_once = false, media_seconds = NULL,
           loc_lat = NULL, loc_lng = NULL, loc_updated_at = NULL, loc_expires_at = NULL, loc_stopped = false,
           ref_product_id = NULL, ref_request_id = NULL, ref_store_id = NULL, ref_profile_id = NULL
     WHERE id = p_msg;
    DELETE FROM public.message_reactions WHERE message_id = p_msg;
END $$;
REVOKE ALL ON FUNCTION public.chat_delete_message(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_delete_message(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.chat_edit_message(p_msg uuid, p_content text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); r public.direct_messages%ROWTYPE; v_text text := btrim(coalesce(p_content, ''));
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
    SELECT * INTO r FROM public.direct_messages WHERE id = p_msg FOR UPDATE;
    IF NOT FOUND OR r.sender_id <> v_me THEN
        RAISE EXCEPTION 'Só quem enviou pode editar.' USING ERRCODE = '42501', HINT = 'edit_sender_only';
    END IF;
    IF r.deleted_at IS NOT NULL OR r.kind <> 'text' OR r.ref_product_id IS NOT NULL OR r.ref_request_id IS NOT NULL
       OR r.ref_store_id IS NOT NULL OR r.ref_profile_id IS NOT NULL THEN
        RAISE EXCEPTION 'Esta mensagem não pode ser editada.' USING ERRCODE = '22023', HINT = 'edit_not_allowed';
    END IF;
    IF r.created_at < now() - interval '15 minutes' THEN
        RAISE EXCEPTION 'Passou o prazo para editar (15 min).' USING ERRCODE = '22023', HINT = 'edit_too_old';
    END IF;
    IF char_length(v_text) NOT BETWEEN 1 AND 2000 THEN
        RAISE EXCEPTION 'Texto inválido.' USING ERRCODE = '22023', HINT = 'edit_text_invalid';
    END IF;
    UPDATE public.direct_messages SET content = v_text, edited_at = now() WHERE id = p_msg;
END $$;
REVOKE ALL ON FUNCTION public.chat_edit_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_edit_message(uuid, text) TO authenticated;

-- quando a outra pessoa leu a conversa (1 a 1): ✓✓ azul quando last_read_at >= a mensagem
CREATE OR REPLACE FUNCTION public.chat_other_read_at(p_conv uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_at timestamptz;
BEGIN
    IF v_me IS NULL OR NOT public._can_access_conversation(p_conv, v_me) THEN
        RAISE EXCEPTION 'Conversa não encontrada.' USING ERRCODE = '42501';
    END IF;
    SELECT min(cm.last_read_at) INTO v_at
      FROM public.conversation_members cm
     WHERE cm.conversation_id = p_conv AND cm.profile_id <> v_me AND cm.status = 'active';
    RETURN v_at;
END $$;
REVOKE ALL ON FUNCTION public.chat_other_read_at(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_other_read_at(uuid) TO authenticated;

-- ---------------------------------------------------------------- tempo real: reações
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
    END IF;
END $$;
