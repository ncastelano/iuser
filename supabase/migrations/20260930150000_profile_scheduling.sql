-- Agendamento no PERFIL: o cliente marca um horário na agenda de outra pessoa.
-- (appointments com store_id nulo, direction 'outgoing', customer <> provider.)

-- Horários já ocupados de um perfil, sem expor quem marcou: só data, hora e duração.
CREATE OR REPLACE FUNCTION public.get_profile_busy_slots(p_profile_id uuid, p_from date, p_to date)
RETURNS TABLE (slot_date text, slot_time text, duration_minutes integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
    SELECT a.date::text, a.time::text, COALESCE(a.duration_minutes, 60)
    FROM public.appointments a
    WHERE a.store_id IS NULL
      AND a.direction = 'outgoing'
      AND a.provider_profile_id = p_profile_id
      AND a.customer_id IS DISTINCT FROM p_profile_id
      AND a.status NOT IN ('cancelled', 'declined')
      AND a.date::date BETWEEN p_from AND p_to;
$$;
REVOKE ALL ON FUNCTION public.get_profile_busy_slots(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.get_profile_busy_slots(uuid, date, date) TO anon, authenticated;

-- No banco também: só perfil com agenda ativa recebe, e dois clientes não
-- pegam o mesmo horário (mesmo se clicarem ao mesmo tempo).
CREATE OR REPLACE FUNCTION public.guard_profile_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_allowed boolean;
    v_start integer;
    v_end integer;
BEGIN
    IF NEW.store_id IS NOT NULL OR NEW.direction IS DISTINCT FROM 'outgoing'
       OR NEW.provider_profile_id IS NULL OR NEW.customer_id IS NOT DISTINCT FROM NEW.provider_profile_id THEN
        RETURN NEW;
    END IF;

    SELECT allow_scheduling INTO v_allowed FROM public.profiles WHERE id = NEW.provider_profile_id;
    IF v_allowed IS NOT TRUE THEN
        RAISE EXCEPTION 'Este perfil não está recebendo agendamentos.';
    END IF;

    -- Serializa marcações concorrentes do mesmo perfil.
    PERFORM pg_advisory_xact_lock(hashtext(NEW.provider_profile_id::text));

    v_start := (EXTRACT(EPOCH FROM NEW.time::time) / 60)::integer;
    v_end := v_start + COALESCE(NEW.duration_minutes, 60);
    IF EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.store_id IS NULL AND a.direction = 'outgoing'
          AND a.provider_profile_id = NEW.provider_profile_id
          AND a.customer_id IS DISTINCT FROM a.provider_profile_id
          AND a.status NOT IN ('cancelled', 'declined')
          AND a.date::date = NEW.date::date
          AND v_start < (EXTRACT(EPOCH FROM a.time::time) / 60)::integer + COALESCE(a.duration_minutes, 60)
          AND (EXTRACT(EPOCH FROM a.time::time) / 60)::integer < v_end
    ) THEN
        RAISE EXCEPTION 'Esse horário acabou de ser reservado. Escolha outro.';
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS appointments_guard_profile_booking ON public.appointments;
CREATE TRIGGER appointments_guard_profile_booking BEFORE INSERT ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.guard_profile_booking();
