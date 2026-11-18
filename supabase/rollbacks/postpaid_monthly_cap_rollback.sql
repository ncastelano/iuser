-- Rollback de 20261130000075_postpaid_monthly_cap.sql: o Pós-pago volta a cobrar R$ 0,50 por uso sem teto no mês (as cobranças já cortadas ficam como estão).
BEGIN;
DROP TRIGGER IF EXISTS driver_postpaid_charges_monthly_cap ON public.driver_postpaid_charges;
DROP FUNCTION IF EXISTS public.trg_postpaid_monthly_cap();
DROP FUNCTION IF EXISTS public.get_my_postpaid_month();
DROP FUNCTION IF EXISTS public._postpaid_month_charged(uuid);
DROP FUNCTION IF EXISTS public.get_postpaid_monthly_cap();
ALTER TABLE public.postpaid_settings DROP COLUMN IF EXISTS monthly_cap;
COMMIT;
