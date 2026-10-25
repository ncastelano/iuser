SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'appointment-deposit-expire';
DROP FUNCTION IF EXISTS public.expire_unpaid_appointment_deposits();
DROP FUNCTION IF EXISTS public.get_appointment_deposit(uuid);
DROP FUNCTION IF EXISTS public.refund_appointment_deposit(uuid);
DROP FUNCTION IF EXISTS public.confirm_appointment_deposit(uuid);
DROP FUNCTION IF EXISTS public.report_appointment_deposit(uuid);
DROP TRIGGER IF EXISTS appointments_deposit_guard ON public.appointments;
DROP FUNCTION IF EXISTS public.appointment_deposit_guard();
DROP TRIGGER IF EXISTS appointments_deposit_insert ON public.appointments;
DROP FUNCTION IF EXISTS public.appointment_deposit_on_insert();
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_deposit_status_check;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS deposit_paid_at, DROP COLUMN IF EXISTS deposit_reported_at, DROP COLUMN IF EXISTS deposit_due_at,
    DROP COLUMN IF EXISTS deposit_status, DROP COLUMN IF EXISTS deposit_amount, DROP COLUMN IF EXISTS service_items;
DROP TRIGGER IF EXISTS stores_guard_deposit ON public.stores;
DROP FUNCTION IF EXISTS public.guard_store_deposit();
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_deposit_check, DROP CONSTRAINT IF EXISTS stores_deposit_policy_check;
ALTER TABLE public.stores DROP COLUMN IF EXISTS deposit_policy, DROP COLUMN IF EXISTS deposit_value, DROP COLUMN IF EXISTS deposit_mode;
