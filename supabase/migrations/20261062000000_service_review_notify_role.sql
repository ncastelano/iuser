-- O aviso de avaliação de serviço guarda pra qual lado ele vai (quem pediu ou quem foi escolhido),
-- pra levar a pessoa pra tela certa ao tocar.
CREATE OR REPLACE FUNCTION public.submit_service_review(p_application uuid, p_rating integer, p_comment text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); a public.service_applications; r public.service_requests; v_reviewee uuid; v_role text; v_comment text := NULLIF(btrim(COALESCE(p_comment, '')), '');
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Escolha de 1 a 5 estrelas'; END IF;
    SELECT * INTO a FROM public.service_applications WHERE id = p_application;
    IF NOT FOUND THEN RAISE EXCEPTION 'Serviço não encontrado'; END IF;
    SELECT * INTO r FROM public.service_requests WHERE id = a.service_request_id;
    IF a.completed_at IS NULL THEN RAISE EXCEPTION 'O serviço ainda não foi marcado como feito'; END IF;
    IF v_user = r.requester_id THEN v_reviewee := a.applicant_id; v_role := 'provider';
    ELSIF v_user = a.applicant_id THEN v_reviewee := r.requester_id; v_role := 'owner';
    ELSE RAISE EXCEPTION 'Você não participou desse serviço'; END IF;

    INSERT INTO public.service_reviews (application_id, service_request_id, reviewer_id, reviewee_id, rating, comment)
    VALUES (a.id, r.id, v_user, v_reviewee, p_rating, left(v_comment, 500))
    ON CONFLICT (application_id, reviewer_id) DO NOTHING;
    IF NOT FOUND THEN RAISE EXCEPTION 'Você já avaliou esse serviço'; END IF;

    BEGIN
        PERFORM public._notify(v_reviewee, 'service_review', v_user, r.id,
            jsonb_build_object('rating', p_rating, 'snippet', left(COALESCE(v_comment, ''), 120), 'title', public._service_request_title(r.id), 'role', v_role),
            'svcrev:' || a.id || ':' || v_user);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.submit_service_review(uuid, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_service_review(uuid, integer, text) TO authenticated;
