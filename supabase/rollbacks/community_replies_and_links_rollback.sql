-- Desfaz 20261112000000_community_replies_and_links.sql
DROP FUNCTION IF EXISTS public.resolve_share_link(text);
DROP TRIGGER IF EXISTS community_messages_reply_check ON public.community_messages;
DROP FUNCTION IF EXISTS public.community_messages_reply_check();
ALTER TABLE public.community_messages DROP COLUMN IF EXISTS reply_to_id;
