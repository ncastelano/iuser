-- Remove leftover trigger/function/table from the old in-app notification system
-- (superseded by Web Push, see push_subscriptions migration). This trigger has
-- been broken since it was created: it references the unquoted identifier
-- "profileSlug" in plpgsql, which Postgres folds to "profileslug" and doesn't
-- match the actual quoted column, causing every INSERT into appointments with
-- status='pending' to fail with "column \"profileslug\" does not exist" (42703).
-- appointment_notifications has 0 rows and no application code references it.
DROP TRIGGER IF EXISTS appointment_notification_trigger ON public.appointments;
DROP FUNCTION IF EXISTS public.create_appointment_notification();
DROP TABLE IF EXISTS public.appointment_notifications;
