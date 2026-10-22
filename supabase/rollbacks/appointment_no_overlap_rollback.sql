DROP TRIGGER IF EXISTS appointments_guard_overlap ON public.appointments;
DROP FUNCTION IF EXISTS public.guard_appointment_overlap();
DROP FUNCTION IF EXISTS public.get_my_busy_slots(date, date);
DROP INDEX IF EXISTS public.appointments_customer_date_idx;
DROP INDEX IF EXISTS public.appointments_provider_date_idx;
CREATE OR REPLACE FUNCTION public.get_profile_busy_slots(p_profile_id uuid, p_from date, p_to date)
RETURNS TABLE(slot_date text, slot_time text, duration_minutes integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT a.date::text, a.time::text, COALESCE(a.duration_minutes, 60)
    FROM public.appointments a
    WHERE a.store_id IS NULL AND a.direction = 'outgoing' AND a.provider_profile_id = p_profile_id
      AND a.customer_id IS DISTINCT FROM p_profile_id
      AND a.status::text NOT IN ('cancelled', 'declined', 'rejected')
      AND a.date::date BETWEEN p_from AND p_to;
$$;
