-- Rollback de 20261130000136_chat_media_location.sql
DROP FUNCTION IF EXISTS public.chat_send_media(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.chat_open_view_once(uuid);
DROP FUNCTION IF EXISTS public.chat_start_location(uuid, int, double precision, double precision);
DROP FUNCTION IF EXISTS public.chat_update_location(uuid, double precision, double precision);
DROP FUNCTION IF EXISTS public.chat_stop_location(uuid);
DROP TRIGGER IF EXISTS direct_messages_media_guard ON public.direct_messages;
DROP FUNCTION IF EXISTS public.direct_messages_media_guard();
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_media_shape_check;
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_loc_range_check;
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_kind_check;
ALTER TABLE public.direct_messages DROP COLUMN IF EXISTS loc_stopped, DROP COLUMN IF EXISTS loc_expires_at, DROP COLUMN IF EXISTS loc_updated_at,
  DROP COLUMN IF EXISTS loc_lng, DROP COLUMN IF EXISTS loc_lat, DROP COLUMN IF EXISTS viewed_at, DROP COLUMN IF EXISTS media_key, DROP COLUMN IF EXISTS kind;
DELETE FROM public.upload_kinds WHERE kind = 'chat_media';
