-- Rollback de 20261130000138_chat_video_audio.sql (atenção: mensagens de vídeo/áudio deixam de ter arquivo válido)
DELETE FROM public.direct_messages WHERE kind IN ('video','audio');
UPDATE public.direct_messages SET kind = 'view_once' WHERE view_once AND kind = 'photo';
DROP FUNCTION IF EXISTS public.chat_send_media(uuid, text, text, text, boolean, integer);
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_media_shape_check;
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_kind_check;
ALTER TABLE public.direct_messages DROP COLUMN IF EXISTS media_seconds, DROP COLUMN IF EXISTS view_once;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_kind_check CHECK (kind IN ('text','photo','view_once','location'));
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_media_shape_check CHECK (
  (kind IN ('text','location') AND media_key IS NULL) OR (kind IN ('photo','view_once') AND media_key IS NOT NULL AND media_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'));
DELETE FROM public.upload_kinds WHERE kind IN ('chat_video','chat_audio');
