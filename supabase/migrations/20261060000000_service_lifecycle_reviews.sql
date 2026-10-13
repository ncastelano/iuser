-- Ciclo do pedido de serviço: candidatura → escolhido → feito → avaliação dos dois lados.
--  • avisos no perfil: alguém quer fazer meu serviço / fui escolhido / o serviço foi marcado como feito / recebi avaliação
--  • o escolhido pode falar com quem pediu (e vice-versa), mesmo sem o chat ligado
--  • quem pediu marca como feito e os dois se avaliam (service_reviews); o card do escolhido fica até isso acontecer
--  • corridas: os avisos equivalentes (candidatura, motorista escolhido, avaliação recebida)

ALTER TABLE public.service_applications
    ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
    ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- ===== Tipos novos de aviso =====
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind IN (
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup',
    'service_application', 'service_selected', 'service_completed', 'service_review',
    'ride_application', 'ride_selected', 'ride_review', 'customer_review'
));

-- ===== O candidato enxerga o pedido em que se inscreveu (mesmo depois de ele sair do quadro de abertos) =====
CREATE OR REPLACE FUNCTION public._is_request_applicant(p_request uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_user IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.service_applications a WHERE a.service_request_id = p_request AND a.applicant_id = p_user
    );
$$;
REVOKE ALL ON FUNCTION public._is_request_applicant(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._is_request_applicant(uuid, uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Candidato vê o pedido em que se inscreveu" ON public.service_requests;
CREATE POLICY "Candidato vê o pedido em que se inscreveu" ON public.service_requests FOR SELECT TO authenticated
    USING (public._is_request_applicant(id, auth.uid()));

-- ===== Avisos =====
CREATE OR REPLACE FUNCTION public._service_request_title(p_request uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(NULLIF(left(btrim(description), 60), ''), NULLIF(custom_service, ''), service_type)
    FROM public.service_requests WHERE id = p_request;
$$;

-- Alguém quer fazer o meu serviço
CREATE OR REPLACE FUNCTION public.trg_notify_service_application() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    BEGIN
        SELECT requester_id INTO v_owner FROM public.service_requests WHERE id = NEW.service_request_id;
        PERFORM public._notify(v_owner, 'service_application', NEW.applicant_id, NEW.service_request_id,
            jsonb_build_object('title', public._service_request_title(NEW.service_request_id)), 'svcapp:' || NEW.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS service_applications_notify ON public.service_applications;
CREATE TRIGGER service_applications_notify AFTER INSERT ON public.service_applications
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_service_application();

-- Fui escolhido: marca a hora, tira o pedido do quadro de abertos e avisa o escolhido
CREATE OR REPLACE FUNCTION public.trg_service_application_selected() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
        SELECT requester_id INTO v_owner FROM public.service_requests WHERE id = NEW.service_request_id;
        UPDATE public.service_requests SET status = 'accepted' WHERE id = NEW.service_request_id AND status = 'pending';
        BEGIN
            PERFORM public._notify(NEW.applicant_id, 'service_selected', v_owner, NEW.service_request_id,
                jsonb_build_object('title', public._service_request_title(NEW.service_request_id)), 'svcsel:' || NEW.id);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
    RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.trg_service_application_stamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN NEW.accepted_at := now(); END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS service_applications_stamp ON public.service_applications;
CREATE TRIGGER service_applications_stamp BEFORE UPDATE OF status ON public.service_applications
    FOR EACH ROW EXECUTE FUNCTION public.trg_service_application_stamp();
DROP TRIGGER IF EXISTS service_applications_selected ON public.service_applications;
CREATE TRIGGER service_applications_selected AFTER UPDATE OF status ON public.service_applications
    FOR EACH ROW EXECUTE FUNCTION public.trg_service_application_selected();

-- ===== Avaliação mútua do serviço =====
CREATE TABLE IF NOT EXISTS public.service_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL REFERENCES public.service_applications(id) ON DELETE CASCADE,
    service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
    reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (application_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS service_reviews_reviewee_idx ON public.service_reviews (reviewee_id);
ALTER TABLE public.service_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Avaliações de serviço são públicas" ON public.service_reviews;
CREATE POLICY "Avaliações de serviço são públicas" ON public.service_reviews FOR SELECT USING (true);
-- Sem policy de escrita: só pela função submit_service_review

-- Quem pediu marca como feito (o escolhido é avisado e os dois passam a poder avaliar)
CREATE OR REPLACE FUNCTION public.complete_service_application(p_application uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); a public.service_applications; r public.service_requests;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    SELECT * INTO a FROM public.service_applications WHERE id = p_application;
    IF NOT FOUND THEN RAISE EXCEPTION 'Candidatura não encontrada'; END IF;
    SELECT * INTO r FROM public.service_requests WHERE id = a.service_request_id;
    IF r.requester_id <> v_user THEN RAISE EXCEPTION 'Só quem pediu o serviço pode marcá-lo como feito'; END IF;
    IF a.status <> 'accepted' THEN RAISE EXCEPTION 'Esse profissional ainda não foi escolhido'; END IF;
    IF a.completed_at IS NOT NULL THEN RETURN true; END IF;

    UPDATE public.service_applications SET completed_at = now() WHERE id = a.id;
    UPDATE public.service_requests SET status = 'completed'
    WHERE id = r.id AND NOT EXISTS (
        SELECT 1 FROM public.service_applications x WHERE x.service_request_id = r.id AND x.status = 'accepted' AND x.completed_at IS NULL
    );
    BEGIN
        PERFORM public._notify(a.applicant_id, 'service_completed', v_user, r.id,
            jsonb_build_object('title', public._service_request_title(r.id)), 'svcdone:' || a.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.complete_service_application(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_service_application(uuid) TO authenticated;

-- Avaliar o outro lado (cada um avalia uma vez, só depois de marcado como feito)
CREATE OR REPLACE FUNCTION public.submit_service_review(p_application uuid, p_rating integer, p_comment text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); a public.service_applications; r public.service_requests; v_reviewee uuid; v_comment text := NULLIF(btrim(COALESCE(p_comment, '')), '');
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Escolha de 1 a 5 estrelas'; END IF;
    SELECT * INTO a FROM public.service_applications WHERE id = p_application;
    IF NOT FOUND THEN RAISE EXCEPTION 'Serviço não encontrado'; END IF;
    SELECT * INTO r FROM public.service_requests WHERE id = a.service_request_id;
    IF a.completed_at IS NULL THEN RAISE EXCEPTION 'O serviço ainda não foi marcado como feito'; END IF;
    IF v_user = r.requester_id THEN v_reviewee := a.applicant_id;
    ELSIF v_user = a.applicant_id THEN v_reviewee := r.requester_id;
    ELSE RAISE EXCEPTION 'Você não participou desse serviço'; END IF;

    INSERT INTO public.service_reviews (application_id, service_request_id, reviewer_id, reviewee_id, rating, comment)
    VALUES (a.id, r.id, v_user, v_reviewee, p_rating, left(v_comment, 500))
    ON CONFLICT (application_id, reviewer_id) DO NOTHING;
    IF NOT FOUND THEN RAISE EXCEPTION 'Você já avaliou esse serviço'; END IF;

    BEGIN
        PERFORM public._notify(v_reviewee, 'service_review', v_user, r.id,
            jsonb_build_object('rating', p_rating, 'snippet', left(COALESCE(v_comment, ''), 120), 'title', public._service_request_title(r.id)),
            'svcrev:' || a.id || ':' || v_user);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.submit_service_review(uuid, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_service_review(uuid, integer, text) TO authenticated;

-- ===== Contato: quem foi escolhido e quem pediu podem conversar mesmo sem o chat ligado =====
CREATE OR REPLACE FUNCTION public._have_accepted_service(p_a uuid, p_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.service_applications a
        JOIN public.service_requests r ON r.id = a.service_request_id
        WHERE a.status = 'accepted'
          AND ((a.applicant_id = p_a AND r.requester_id = p_b) OR (a.applicant_id = p_b AND r.requester_id = p_a))
    );
$$;
REVOKE ALL ON FUNCTION public._have_accepted_service(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._have_accepted_service(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.start_conversation(p_owner_profile uuid DEFAULT NULL, p_store uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_id uuid; v_ok boolean;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra conversar'; END IF;
    IF (p_owner_profile IS NULL) = (p_store IS NULL) THEN RAISE EXCEPTION 'Escolha um perfil ou uma loja'; END IF;

    IF p_owner_profile IS NOT NULL THEN
        IF p_owner_profile = v_user THEN RAISE EXCEPTION 'Você não pode conversar consigo mesmo'; END IF;
        SELECT chat_enabled INTO v_ok FROM public.profiles WHERE id = p_owner_profile;
        IF v_ok IS DISTINCT FROM true AND NOT public._have_accepted_service(v_user, p_owner_profile) THEN
            RAISE EXCEPTION 'Essa pessoa não está recebendo conversas';
        END IF;
        SELECT id INTO v_id FROM public.conversations WHERE customer_id = v_user AND owner_profile_id = p_owner_profile;
        IF v_id IS NULL THEN
            INSERT INTO public.conversations (customer_id, owner_profile_id) VALUES (v_user, p_owner_profile) RETURNING id INTO v_id;
        END IF;
    ELSE
        SELECT chat_enabled INTO v_ok FROM public.stores WHERE id = p_store AND is_active;
        IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Essa loja não está recebendo conversas'; END IF;
        IF EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = v_user) THEN RAISE EXCEPTION 'Essa loja é sua'; END IF;
        SELECT id INTO v_id FROM public.conversations WHERE customer_id = v_user AND store_id = p_store;
        IF v_id IS NULL THEN
            INSERT INTO public.conversations (customer_id, store_id) VALUES (v_user, p_store) RETURNING id INTO v_id;
        END IF;
    END IF;
    RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.start_conversation(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_conversation(uuid, uuid) TO authenticated;

-- ===== Corridas: os avisos equivalentes =====
CREATE OR REPLACE FUNCTION public.trg_notify_ride_application() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_requester uuid;
BEGIN
    BEGIN
        SELECT requester_id INTO v_requester FROM public.ride_requests WHERE id = NEW.ride_request_id;
        PERFORM public._notify(v_requester, 'ride_application', NEW.applicant_id, NEW.ride_request_id,
            jsonb_build_object('price', NEW.proposed_price), 'rideapp:' || NEW.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_applications_notify ON public.ride_applications;
CREATE TRIGGER ride_applications_notify AFTER INSERT ON public.ride_applications
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_ride_application();

CREATE OR REPLACE FUNCTION public.trg_notify_ride_selected() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.driver_id IS NOT NULL AND NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
        BEGIN
            PERFORM public._notify(NEW.driver_id, 'ride_selected', NEW.requester_id, NEW.id, '{}'::jsonb, 'rideSel:' || NEW.id || ':' || NEW.driver_id);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_requests_notify_selected ON public.ride_requests;
CREATE TRIGGER ride_requests_notify_selected AFTER UPDATE OF driver_id ON public.ride_requests
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_ride_selected();

CREATE OR REPLACE FUNCTION public.trg_notify_ride_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    BEGIN
        PERFORM public._notify(NEW.reviewee_id, 'ride_review', NEW.reviewer_id, NEW.ride_request_id,
            jsonb_build_object('rating', NEW.rating, 'snippet', left(COALESCE(NEW.comment, ''), 120)), 'riderev:' || NEW.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_reviews_notify ON public.ride_reviews;
CREATE TRIGGER ride_reviews_notify AFTER INSERT ON public.ride_reviews
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_ride_review();
