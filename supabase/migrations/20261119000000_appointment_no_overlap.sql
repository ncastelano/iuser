-- Ninguém fica em dois lugares ao mesmo tempo: uma PESSOA (como cliente de qualquer loja/perfil, ou como quem recebe agendamentos no
-- próprio perfil) não pode ter dois compromissos ATIVOS que se sobreponham. Vale no banco, então vale para tela, API e chamada direta.
--   participantes de um agendamento = customer_id e provider_profile_id (agenda de perfil); compromisso pessoal (cliente = prestador) fica de fora
--   ativo = pending, confirmed ou completed (cancelled não conta)
-- Linhas antigas que já se sobrepõem não são mexidas (o gatilho só confere o que está sendo criado/alterado de horário, pessoa ou reativado).

CREATE INDEX IF NOT EXISTS appointments_customer_date_idx ON public.appointments (customer_id, date);
CREATE INDEX IF NOT EXISTS appointments_provider_date_idx ON public.appointments (provider_profile_id, date) WHERE provider_profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_appointment_overlap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_start integer;
    v_end integer;
    v_clash_customer boolean;
    v_clash_provider boolean;
BEGIN
    IF NEW.status::text NOT IN ('pending', 'confirmed', 'completed') THEN RETURN NEW; END IF;
    -- compromisso pessoal (a própria pessoa na própria agenda): não disputa horário com os outros
    IF NEW.provider_profile_id IS NOT NULL AND NEW.customer_id IS NOT DISTINCT FROM NEW.provider_profile_id THEN RETURN NEW; END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.date IS NOT DISTINCT FROM OLD.date AND NEW.time IS NOT DISTINCT FROM OLD.time
       AND COALESCE(NEW.duration_minutes, 60) = COALESCE(OLD.duration_minutes, 60)
       AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id AND NEW.provider_profile_id IS NOT DISTINCT FROM OLD.provider_profile_id
       AND OLD.status::text IN ('pending', 'confirmed', 'completed') THEN
        RETURN NEW; -- só mudou o status entre ativos (aceitar, concluir) ou campos de entrada: nada de novo para conferir
    END IF;

    -- serializa as marcações concorrentes das mesmas pessoas (ordem fixa para não travar uma na outra)
    PERFORM pg_advisory_xact_lock(hashtext(p::text))
    FROM (SELECT DISTINCT p FROM unnest(ARRAY[NEW.customer_id, NEW.provider_profile_id]) AS p WHERE p IS NOT NULL ORDER BY p) x;

    v_start := (EXTRACT(EPOCH FROM NEW.time::time) / 60)::integer;
    v_end := v_start + COALESCE(NEW.duration_minutes, 60);

    SELECT
        bool_or(a.customer_id = NEW.customer_id OR a.provider_profile_id = NEW.customer_id),
        bool_or(NEW.provider_profile_id IS NOT NULL AND (a.customer_id = NEW.provider_profile_id OR a.provider_profile_id = NEW.provider_profile_id))
    INTO v_clash_customer, v_clash_provider
    FROM public.appointments a
    WHERE a.id IS DISTINCT FROM NEW.id
      AND a.status::text IN ('pending', 'confirmed', 'completed')
      AND NOT (a.provider_profile_id IS NOT NULL AND a.customer_id IS NOT DISTINCT FROM a.provider_profile_id)
      AND a.date::date = NEW.date::date
      AND v_start < (EXTRACT(EPOCH FROM a.time::time) / 60)::integer + COALESCE(a.duration_minutes, 60)
      AND (EXTRACT(EPOCH FROM a.time::time) / 60)::integer < v_end
      AND (a.customer_id = ANY(ARRAY[NEW.customer_id, NEW.provider_profile_id])
           OR a.provider_profile_id = ANY(ARRAY[NEW.customer_id, NEW.provider_profile_id]));

    IF COALESCE(v_clash_provider, false) THEN
        RAISE EXCEPTION 'Esse horário não está mais disponível. Escolha outro.' USING ERRCODE = 'P0001';
    END IF;
    IF COALESCE(v_clash_customer, false) THEN
        RAISE EXCEPTION 'Você já tem outro compromisso nesse horário.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS appointments_guard_overlap ON public.appointments;
CREATE TRIGGER appointments_guard_overlap
    BEFORE INSERT OR UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.guard_appointment_overlap();

-- Horários ocupados de um PERFIL: os agendamentos que outros fizeram com ele + os compromissos dele como cliente (ele não está livre)
CREATE OR REPLACE FUNCTION public.get_profile_busy_slots(p_profile_id uuid, p_from date, p_to date)
RETURNS TABLE(slot_date text, slot_time text, duration_minutes integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT a.date::text, a.time::text, COALESCE(a.duration_minutes, 60)
    FROM public.appointments a
    WHERE (a.provider_profile_id = p_profile_id OR a.customer_id = p_profile_id)
      AND NOT (a.provider_profile_id IS NOT NULL AND a.customer_id IS NOT DISTINCT FROM a.provider_profile_id)
      AND a.status::text IN ('pending', 'confirmed', 'completed')
      AND a.date::date BETWEEN p_from AND p_to;
$$;

-- Os horários em que EU já estou ocupado (como cliente ou como quem recebe): a tela esconde esses horários ao marcar algo novo
CREATE OR REPLACE FUNCTION public.get_my_busy_slots(p_from date, p_to date)
RETURNS TABLE(slot_date text, slot_time text, duration_minutes integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT a.date::text, a.time::text, COALESCE(a.duration_minutes, 60)
    FROM public.appointments a
    WHERE auth.uid() IS NOT NULL
      AND (a.customer_id = auth.uid() OR a.provider_profile_id = auth.uid())
      AND NOT (a.provider_profile_id IS NOT NULL AND a.customer_id IS NOT DISTINCT FROM a.provider_profile_id)
      AND a.status::text IN ('pending', 'confirmed', 'completed')
      AND a.date::date BETWEEN p_from AND LEAST(p_to, p_from + 62);
$$;
REVOKE ALL ON FUNCTION public.get_my_busy_slots(date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_busy_slots(date, date) TO authenticated;
