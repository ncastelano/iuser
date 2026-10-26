-- Respaldo do dono ficou mais completo: junto do histórico, o resumo de COMO a pessoa avalia os serviços (média que dá, notas baixas),
-- para quem presta serviço decidir antes de aceitar. Só substitui get_client_track_record (mesmas regras de acesso).
-- Rollback: reaplicar a função de 20261124000000_appointment_service_reviews.sql.

-- ===== Respaldo para o dono: o histórico de um cliente =====
-- Só quem presta serviço E já tem (ou teve) um agendamento com esse cliente. Devolve: o que OUTROS donos disseram do cliente e o que o
-- cliente disse dos serviços. O cliente nunca chama isso para si (precisa ser o prestador de um agendamento dele).
CREATE OR REPLACE FUNCTION public.get_client_track_record(p_client uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_ok boolean;
BEGIN
    IF v_user IS NULL OR p_client IS NULL OR p_client = v_user THEN RETURN NULL; END IF;
    SELECT EXISTS (SELECT 1 FROM public.appointments x WHERE x.customer_id = p_client AND public._appointment_service_owner(x) = v_user) INTO v_ok;
    IF NOT v_ok THEN RETURN NULL; END IF;
    RETURN jsonb_build_object(
        'by_owners', COALESCE((
            SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM (
                SELECT r.rating, r.comment, r.created_at, r.service_name,
                       COALESCE(st.name, pr.name) AS owner_name, COALESCE(pr."profileSlug") AS owner_slug, (r.reviewer_id = v_user) AS mine
                FROM public.appointment_reviews r
                LEFT JOIN public.stores st ON st.id = r.store_id
                LEFT JOIN public.profiles pr ON pr.id = r.reviewer_id
                WHERE r.kind = 'client' AND r.reviewee_id = p_client
                ORDER BY r.created_at DESC LIMIT 20) t), '[]'::jsonb),
        'own_comments', COALESCE((
            SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM (
                SELECT r.rating, r.comment, r.created_at, r.service_name, st.name AS store_name
                FROM public.appointment_reviews r
                LEFT JOIN public.stores st ON st.id = r.store_id
                WHERE r.kind = 'service' AND r.reviewer_id = p_client
                ORDER BY r.created_at DESC LIMIT 20) t), '[]'::jsonb),
        -- como a pessoa costuma AVALIAR os serviços (para o dono ver se ela só reclama): média que dá, quantas notas baixas (1–2★) e quantas com comentário
        'own_summary', (SELECT jsonb_build_object('count', count(*), 'avg', COALESCE(round(avg(rating)::numeric, 1), 0),
                               'low', count(*) FILTER (WHERE rating <= 2), 'with_comment', count(*) FILTER (WHERE comment IS NOT NULL))
                        FROM public.appointment_reviews WHERE kind = 'service' AND reviewer_id = p_client),
        'summary', (SELECT jsonb_build_object('count', count(*), 'avg', COALESCE(round(avg(rating)::numeric, 1), 0))
                    FROM public.appointment_reviews WHERE kind = 'client' AND reviewee_id = p_client),
        'services_done', (SELECT count(*) FROM public.appointments x WHERE x.customer_id = p_client AND x.status = 'completed' AND public._appointment_service_owner(x) IS NOT NULL)
    );
END; $$;
REVOKE ALL ON FUNCTION public.get_client_track_record(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_client_track_record(uuid) TO authenticated;
