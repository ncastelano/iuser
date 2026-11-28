-- Rollback da 20261130000146 (aviso de novidade na barra do aparelho).
BEGIN;
DROP FUNCTION IF EXISTS public.admin_forum_announce_remaining(uuid);
DROP FUNCTION IF EXISTS public.admin_forum_announce_claim(uuid, integer);
DROP FUNCTION IF EXISTS public.admin_forum_announce(uuid);
DROP FUNCTION IF EXISTS public._update_announce_targets();
DROP FUNCTION IF EXISTS public.set_update_notifications(boolean);
DROP FUNCTION IF EXISTS public.get_update_notifications();
DROP TABLE IF EXISTS public.update_announcement_queue;
DROP TABLE IF EXISTS public.update_notification_prefs;
ALTER TABLE public.forum_releases DROP COLUMN IF EXISTS announced_at;
COMMIT;
