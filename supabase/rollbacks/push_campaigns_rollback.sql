-- Rollback da 20261130000149 (avisos/campanhas de push e interruptor de Ofertas).
BEGIN;
DROP FUNCTION IF EXISTS public.get_my_campaigns(uuid);
DROP FUNCTION IF EXISTS public.campaign_mark_sent(uuid, integer);
DROP FUNCTION IF EXISTS public.campaign_remaining(uuid);
DROP FUNCTION IF EXISTS public.campaign_claim(uuid, integer);
DROP FUNCTION IF EXISTS public.campaign_create(text, text, text, text, uuid, uuid[], uuid);
DROP FUNCTION IF EXISTS public.campaign_preview(text, uuid, uuid[]);
DROP FUNCTION IF EXISTS public._campaign_check_sender(text, uuid, uuid[]);
DROP FUNCTION IF EXISTS public._campaign_audience(text, uuid, uuid[]);
DROP TABLE IF EXISTS public.push_campaign_queue;
DROP TABLE IF EXISTS public.push_campaigns;
DROP TABLE IF EXISTS public.campaign_settings;
DROP FUNCTION IF EXISTS public.set_promo_notifications(boolean);
DROP FUNCTION IF EXISTS public.get_promo_notifications();
ALTER TABLE public.update_notification_prefs DROP COLUMN IF EXISTS promo_enabled;
COMMIT;
