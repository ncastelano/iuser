-- Gorjeta no serviço: o profissional pode registrar que RECEBEU uma gorjeta de quem o contratou e decidir se isso
-- pode ser mostrado (aos outros profissionais, no pedido da pessoa).
--
-- Gorjeta é um agrado, NUNCA uma obrigação do contratante:
--   • só existe linha quando houve gorjeta — a falta dela não é registrada, nem visível, nem pesa na avaliação;
--   • o contratante não é "marcado" por não ter dado;
--   • só aparece pra terceiros se o profissional marcou "pode mostrar" (tip_visible).
-- Fica numa tabela à parte (service_reviews é pública; aqui o que não é visível não pode vazar).

CREATE TABLE IF NOT EXISTS public.service_tips (
    application_id uuid PRIMARY KEY REFERENCES public.service_applications(id) ON DELETE CASCADE,
    tipper_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,    -- quem pediu o serviço (deu a gorjeta)
    receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,  -- o profissional (recebeu)
    tip_visible boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_tips_tipper_idx ON public.service_tips (tipper_id) WHERE tip_visible;

ALTER TABLE public.service_tips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gorjeta: os dois lados veem; os outros só se for visível" ON public.service_tips;
CREATE POLICY "Gorjeta: os dois lados veem; os outros só se for visível" ON public.service_tips FOR SELECT
    USING (tip_visible OR auth.uid() = tipper_id OR auth.uid() = receiver_id);
-- Sem policy de escrita: só pela função submit_service_review

-- Avaliar o outro lado (agora com o registro opcional da gorjeta, só do profissional)
DROP FUNCTION IF EXISTS public.submit_service_review(uuid, integer, text);
CREATE OR REPLACE FUNCTION public.submit_service_review(
    p_application uuid, p_rating integer, p_comment text DEFAULT NULL,
    p_tip_received boolean DEFAULT false, p_tip_visible boolean DEFAULT false
)
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

    -- Gorjeta: só quem prestou o serviço registra, e só quando recebeu
    IF v_user = a.applicant_id AND COALESCE(p_tip_received, false) THEN
        INSERT INTO public.service_tips (application_id, tipper_id, receiver_id, tip_visible)
        VALUES (a.id, r.requester_id, a.applicant_id, COALESCE(p_tip_visible, false))
        ON CONFLICT (application_id) DO NOTHING;
    END IF;

    BEGIN
        PERFORM public._notify(v_reviewee, 'service_review', v_user, r.id,
            jsonb_build_object('rating', p_rating, 'snippet', left(COALESCE(v_comment, ''), 120), 'title', public._service_request_title(r.id), 'role', v_role),
            'svcrev:' || a.id || ':' || v_user);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.submit_service_review(uuid, integer, text, boolean, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_service_review(uuid, integer, text, boolean, boolean) TO authenticated;

-- Quantas gorjetas VISÍVEIS cada pessoa já deu (pro profissional ver no pedido). Quem não deu não aparece na lista:
-- não existe "zero gorjetas" pra mostrar.
CREATE OR REPLACE FUNCTION public.get_requester_tip_counts(p_ids uuid[])
RETURNS TABLE (profile_id uuid, tips integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT tipper_id, count(*)::integer
    FROM public.service_tips
    WHERE tip_visible AND tipper_id = ANY(p_ids)
    GROUP BY tipper_id;
$$;
REVOKE ALL ON FUNCTION public.get_requester_tip_counts(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_requester_tip_counts(uuid[]) TO anon, authenticated;
