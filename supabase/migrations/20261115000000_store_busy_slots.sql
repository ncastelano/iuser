-- Horários já ocupados de uma LOJA, sem expor quem marcou: só data, hora e duração (mesmo desenho do get_profile_busy_slots).
-- Alimenta a página de atendimento da loja (vagas livres e, se a pessoa quiser ver, os ocupados) e o agendador, que antes só
-- conhecia os agendamentos do próprio cliente e por isso não via as vagas tomadas por outras pessoas.
-- Só leitura. NÃO impede dois clientes de marcarem o mesmo horário (isso seria um gatilho de guarda como o do perfil).
CREATE OR REPLACE FUNCTION public.get_store_busy_slots(p_store_id uuid, p_from date, p_to date)
RETURNS TABLE (slot_date text, slot_time text, duration_minutes integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
    SELECT DISTINCT a.date::text, a.time::text, COALESCE(a.duration_minutes, 60)
    FROM public.appointments a
    WHERE a.store_id = p_store_id
      AND a.status::text NOT IN ('cancelled', 'declined', 'rejected')
      AND a.date::date BETWEEN p_from AND LEAST(p_to, p_from + 62)
    ORDER BY 1, 2;
$$;
REVOKE ALL ON FUNCTION public.get_store_busy_slots(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.get_store_busy_slots(uuid, date, date) TO anon, authenticated;
