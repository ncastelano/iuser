-- Rollback da 20261130000141 (conversas: apagar, responder, reagir, editar, visto).
-- Mensagens apagadas para todos continuam apagadas (o conteúdo já saiu); só o recurso novo some.
BEGIN;
DROP FUNCTION IF EXISTS public.chat_other_read_at(uuid);
DROP FUNCTION IF EXISTS public.chat_edit_message(uuid, text);
DROP FUNCTION IF EXISTS public.chat_delete_message(uuid, boolean);
DROP FUNCTION IF EXISTS public.chat_react(uuid, text);
DROP TABLE IF EXISTS public.direct_message_hidden;
DROP TABLE IF EXISTS public.message_reactions;
DROP TRIGGER IF EXISTS direct_messages_reply_guard ON public.direct_messages;
DROP FUNCTION IF EXISTS public.direct_messages_reply_guard();
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_content_check;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_content_check CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000);
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_media_shape_check;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_media_shape_check CHECK (
  (kind IN ('text','location') AND media_key IS NULL AND NOT view_once AND media_seconds IS NULL)
  OR (kind IN ('photo','video','audio') AND media_key IS NOT NULL AND media_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'
      AND (kind <> 'photo' OR media_seconds IS NULL)
      AND (kind <> 'video' OR media_seconds BETWEEN 1 AND 60)
      AND (kind <> 'audio' OR media_seconds BETWEEN 1 AND 300))
);
ALTER TABLE public.direct_messages DROP COLUMN IF EXISTS reply_to_id;
ALTER TABLE public.direct_messages DROP COLUMN IF EXISTS edited_at;
ALTER TABLE public.direct_messages DROP COLUMN IF EXISTS deleted_at;
COMMIT;
