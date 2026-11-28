-- =====================================================================
-- CONVERSAS: visualização única POR PESSOA — 28/11/2026
--
-- Antes, `direct_messages.viewed_at` era a única marca: num grupo a primeira pessoa que abria consumia a
-- mensagem para todas as outras. Agora cada pessoa que recebe tem a sua visualização (direct_message_views).
-- `viewed_at` continua existindo só para o remetente ver "já visualizada" (guarda a primeira abertura).
-- Rollback: supabase/rollbacks/chat_view_once_per_viewer_rollback.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.direct_message_views (
    message_id uuid NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    viewed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, profile_id)
);
CREATE INDEX IF NOT EXISTS direct_message_views_conv_idx ON public.direct_message_views (conversation_id, profile_id);
ALTER TABLE public.direct_message_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_message_views FROM anon, authenticated;
GRANT SELECT ON public.direct_message_views TO authenticated;
DROP POLICY IF EXISTS "Cada um vê as próprias visualizações" ON public.direct_message_views;
CREATE POLICY "Cada um vê as próprias visualizações" ON public.direct_message_views FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

-- quem recebe abre UMA vez; quem enviou nunca abre; o banco marca a visualização na mesma transação em que devolve a chave
CREATE OR REPLACE FUNCTION public.chat_open_view_once(p_msg uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); r public.direct_messages%ROWTYPE;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
    SELECT * INTO r FROM public.direct_messages WHERE id = p_msg FOR UPDATE;
    IF NOT FOUND OR NOT r.view_once OR r.kind NOT IN ('photo','video','audio') OR r.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Mídia não encontrada.' USING ERRCODE = '42501';
    END IF;
    IF r.sender_id = v_me OR NOT public._can_access_conversation(r.conversation_id, v_me) THEN
        RAISE EXCEPTION 'Só quem recebeu pode abrir.' USING ERRCODE = '42501', HINT = 'view_once_recipient_only';
    END IF;
    IF EXISTS (SELECT 1 FROM public.direct_message_views WHERE message_id = p_msg AND profile_id = v_me) THEN
        RAISE EXCEPTION 'Esta mídia já foi visualizada.' USING ERRCODE = '22023', HINT = 'view_once_used';
    END IF;
    INSERT INTO public.direct_message_views (message_id, conversation_id, profile_id) VALUES (p_msg, r.conversation_id, v_me);
    UPDATE public.direct_messages SET viewed_at = coalesce(viewed_at, now()) WHERE id = p_msg;
    RETURN r.media_key;
END $$;
REVOKE ALL ON FUNCTION public.chat_open_view_once(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_open_view_once(uuid) TO authenticated;

