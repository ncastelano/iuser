-- Ciclo do SERVIÇO agendado: agendar → (entrada, se a loja pedir) → confirmar → o dono marca "serviço feito" → os dois se avaliam.
--
-- Quem vê o quê (regra do produto):
--  * a avaliação que o CLIENTE faz do serviço vai para as avaliações do serviço (product_reviews, públicas) e o dono a vê;
--  * a avaliação que o DONO faz do cliente NUNCA aparece para o cliente: só o dono que escreveu e os outros donos de serviço que
--    atenderam (ou vão atender) esse cliente, como respaldo na hora de aceitar o convite (get_client_track_record);
--  * o cliente só enxerga as avaliações que ELE mesmo fez.
-- Nada de escrita direta: tudo por função (SECURITY DEFINER) que confere quem é quem.
-- Rollback: supabase/rollbacks/appointment_service_reviews_rollback.sql.

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.appointment_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('service', 'client')),                       -- service = cliente avalia o serviço; client = dono avalia o cliente
    reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,     -- service: dono do serviço; client: o cliente
    store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
    service_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    service_name text,
    rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (appointment_id, kind)
);
CREATE INDEX IF NOT EXISTS appointment_reviews_reviewee_idx ON public.appointment_reviews (reviewee_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS appointment_reviews_reviewer_idx ON public.appointment_reviews (reviewer_id, created_at DESC);
ALTER TABLE public.appointment_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.appointment_reviews FROM anon, authenticated;
GRANT SELECT ON public.appointment_reviews TO authenticated;
-- Cada um lê só a PRÓPRIA avaliação (a do cliente sobre o serviço também está nas avaliações públicas do serviço)
DROP POLICY IF EXISTS "Cada um lê a avaliação que fez" ON public.appointment_reviews;
CREATE POLICY "Cada um lê a avaliação que fez" ON public.appointment_reviews FOR SELECT TO authenticated USING (reviewer_id = auth.uid());

-- Quem presta o serviço de um agendamento: o dono da loja, ou o perfil prestador. NULL = compromisso que não é serviço (pessoal/convite entre pessoas).
CREATE OR REPLACE FUNCTION public._appointment_service_owner(a public.appointments)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE
        WHEN a.store_id IS NOT NULL THEN (SELECT s.owner_id FROM public.stores s WHERE s.id = a.store_id)
        WHEN a.provider_profile_id IS NOT NULL THEN a.provider_profile_id
        ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public._appointment_service_owner(public.appointments) FROM public, anon, authenticated;

-- O serviço (produto) de um agendamento: o vínculo direto ou, sem ele, o serviço da loja com o mesmo nome
CREATE OR REPLACE FUNCTION public._appointment_service_id(a public.appointments)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(a.service_id, (
        SELECT p.id FROM public.products p
        WHERE a.store_id IS NOT NULL AND p.store_id = a.store_id AND p.type = 'service' AND lower(btrim(p.name)) = lower(btrim(a.service_name)) LIMIT 1));
$$;
REVOKE ALL ON FUNCTION public._appointment_service_id(public.appointments) FROM public, anon, authenticated;

-- ===== O dono marca "serviço feito" =====
CREATE OR REPLACE FUNCTION public.complete_appointment(p_appointment uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); a public.appointments;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    SELECT * INTO a FROM public.appointments WHERE id = p_appointment FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado'; END IF;
    IF public._appointment_service_owner(a) IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'Só quem presta o serviço pode marcá-lo como feito'; END IF;
    IF a.customer_id = v_user THEN RAISE EXCEPTION 'Esse compromisso não é um serviço'; END IF;
    IF a.status = 'completed' THEN RETURN true; END IF;
    IF a.status <> 'confirmed' THEN RAISE EXCEPTION 'Só um agendamento confirmado pode ser marcado como feito'; END IF;
    UPDATE public.appointments SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = a.id;
    RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.complete_appointment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_appointment(uuid) TO authenticated;

-- ===== Avaliar (cliente → serviço, dono → cliente) =====
CREATE OR REPLACE FUNCTION public.submit_appointment_review(p_appointment uuid, p_rating integer, p_comment text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user uuid := auth.uid(); a public.appointments; v_owner uuid; v_service uuid; v_comment text := left(NULLIF(btrim(COALESCE(p_comment, '')), ''), 500);
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Escolha de 1 a 5 estrelas'; END IF;
    SELECT * INTO a FROM public.appointments WHERE id = p_appointment;
    IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado'; END IF;
    v_owner := public._appointment_service_owner(a);
    IF v_owner IS NULL OR v_owner = a.customer_id THEN RAISE EXCEPTION 'Esse compromisso não é um serviço'; END IF;
    IF a.status <> 'completed' THEN RAISE EXCEPTION 'O serviço ainda não foi finalizado'; END IF;
    v_service := public._appointment_service_id(a);

    IF v_user = a.customer_id THEN
        INSERT INTO public.appointment_reviews (appointment_id, kind, reviewer_id, reviewee_id, store_id, service_id, service_name, rating, comment)
        VALUES (a.id, 'service', v_user, v_owner, a.store_id, v_service, a.service_name, p_rating, v_comment)
        ON CONFLICT (appointment_id, kind) DO NOTHING;
        IF NOT FOUND THEN RAISE EXCEPTION 'Você já avaliou esse serviço'; END IF;
        -- vai para as avaliações do serviço (públicas)
        IF v_service IS NOT NULL THEN
            INSERT INTO public.product_reviews (store_id, product_id, profile_id, rating, comment, is_anonymous)
            VALUES (a.store_id, v_service, v_user, p_rating, v_comment, false);
        END IF;
    ELSIF v_user = v_owner THEN
        INSERT INTO public.appointment_reviews (appointment_id, kind, reviewer_id, reviewee_id, store_id, service_id, service_name, rating, comment)
        VALUES (a.id, 'client', v_user, a.customer_id, a.store_id, v_service, a.service_name, p_rating, v_comment)
        ON CONFLICT (appointment_id, kind) DO NOTHING;
        IF NOT FOUND THEN RAISE EXCEPTION 'Você já avaliou esse cliente'; END IF;
    ELSE
        RAISE EXCEPTION 'Só quem participa do serviço pode avaliar';
    END IF;
    RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.submit_appointment_review(uuid, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_appointment_review(uuid, integer, text) TO authenticated;

-- ===== Situação das avaliações de um agendamento, para quem participa =====
-- cliente: só a avaliação que ele fez; dono: a que ele fez do cliente + a que o cliente fez do serviço (nunca o contrário)
CREATE OR REPLACE FUNCTION public.get_appointment_review_state(p_appointment uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); a public.appointments; v_owner uuid; v_role text; v_mine jsonb; v_theirs jsonb;
BEGIN
    IF v_user IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO a FROM public.appointments WHERE id = p_appointment;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_owner := public._appointment_service_owner(a);
    IF v_owner IS NULL OR v_owner = a.customer_id THEN RETURN NULL; END IF;
    v_role := CASE WHEN v_user = a.customer_id THEN 'customer' WHEN v_user = v_owner THEN 'owner' ELSE NULL END;
    IF v_role IS NULL THEN RETURN NULL; END IF;

    SELECT jsonb_build_object('rating', r.rating, 'comment', r.comment, 'created_at', r.created_at) INTO v_mine
        FROM public.appointment_reviews r WHERE r.appointment_id = a.id AND r.kind = CASE WHEN v_role = 'customer' THEN 'service' ELSE 'client' END;
    IF v_role = 'owner' THEN
        SELECT jsonb_build_object('rating', r.rating, 'comment', r.comment, 'created_at', r.created_at) INTO v_theirs
            FROM public.appointment_reviews r WHERE r.appointment_id = a.id AND r.kind = 'service';
    END IF;
    RETURN jsonb_build_object(
        'role', v_role, 'status', a.status, 'completed_at', a.completed_at,
        'can_complete', v_role = 'owner' AND a.status = 'confirmed',
        'can_review', a.status = 'completed' AND v_mine IS NULL,
        'my_review', v_mine,
        'client_review', v_theirs
    );
END; $$;
REVOKE ALL ON FUNCTION public.get_appointment_review_state(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_appointment_review_state(uuid) TO authenticated;

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
        'summary', (SELECT jsonb_build_object('count', count(*), 'avg', COALESCE(round(avg(rating)::numeric, 1), 0))
                    FROM public.appointment_reviews WHERE kind = 'client' AND reviewee_id = p_client),
        'services_done', (SELECT count(*) FROM public.appointments x WHERE x.customer_id = p_client AND x.status = 'completed' AND public._appointment_service_owner(x) IS NOT NULL)
    );
END; $$;
REVOKE ALL ON FUNCTION public.get_client_track_record(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_client_track_record(uuid) TO authenticated;
