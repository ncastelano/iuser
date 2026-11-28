-- Rollback da 20261130000143 (visualização única por pessoa). Volta à marca única de direct_messages.viewed_at.
BEGIN;
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
DROP TABLE IF EXISTS public.direct_message_views;
COMMIT;
