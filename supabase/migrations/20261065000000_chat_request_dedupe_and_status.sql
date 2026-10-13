-- (1) Não repete só o MESMO texto do cartão nas últimas 12 h (texto novo = mensagem nova).
--     start_conversation_about_request é a mesma da 20261064, só com o content = v_text na checagem.
CREATE OR REPLACE FUNCTION public.start_conversation_about_request(p_application uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user uuid := auth.uid();
    a public.service_applications;
    r public.service_requests;
    v_other uuid;
    v_conv uuid;
    v_text text;
    v_chosen boolean;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra conversar'; END IF;
    SELECT * INTO a FROM public.service_applications WHERE id = p_application;
    IF NOT FOUND THEN RAISE EXCEPTION 'Candidatura não encontrada'; END IF;
    SELECT * INTO r FROM public.service_requests WHERE id = a.service_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

    v_chosen := a.status = 'accepted';
    IF v_user = r.requester_id THEN
        v_other := a.applicant_id;
        v_text := CASE WHEN v_chosen
            THEN 'Oi! Escolhi você pra fazer o serviço que eu publiquei aqui no iUser. Vamos combinar os detalhes?'
            ELSE 'Oi! Vi que você quer fazer o serviço que eu publiquei aqui no iUser. Podemos conversar?' END;
    ELSIF v_user = a.applicant_id THEN
        v_other := r.requester_id;
        v_text := CASE WHEN v_chosen
            THEN 'Oi! Vi que você me escolheu pro serviço que publicou no iUser. Vamos combinar os detalhes?'
            ELSE 'Oi! Me candidatei ao serviço que você publicou no iUser. Posso tirar alguma dúvida com você?' END;
    ELSE RAISE EXCEPTION 'Você não participa desse pedido';
    END IF;

    v_conv := public.start_conversation(v_other, NULL);

    IF NOT EXISTS (
        SELECT 1 FROM public.direct_messages
        WHERE conversation_id = v_conv AND sender_id = v_user AND ref_request_id = r.id AND content = v_text
          AND created_at > now() - interval '12 hours'
    ) THEN
        INSERT INTO public.direct_messages (conversation_id, sender_id, content, ref_request_id)
        VALUES (v_conv, v_user, v_text, r.id);
    END IF;
    RETURN v_conv;
END; $$;
REVOKE ALL ON FUNCTION public.start_conversation_about_request(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_conversation_about_request(uuid) TO authenticated;

-- (2) A situação do cartão sai das candidaturas (pedidos antigos podem estar 'pending' mesmo com alguém contratado)
CREATE OR REPLACE FUNCTION public.get_conversation_request_refs(p_conv uuid)
RETURNS TABLE (
    id uuid, service_type text, custom_service text, description text, location_address text,
    photo_urls text[], status text, created_at timestamptz, requester_slug text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT r.id, r.service_type, r.custom_service, r.description, r.location_address, r.photo_urls,
           CASE
               WHEN EXISTS (SELECT 1 FROM public.service_applications a WHERE a.service_request_id = r.id AND a.status = 'accepted' AND a.completed_at IS NOT NULL)
                   AND NOT EXISTS (SELECT 1 FROM public.service_applications a WHERE a.service_request_id = r.id AND a.status = 'accepted' AND a.completed_at IS NULL) THEN 'completed'
               WHEN EXISTS (SELECT 1 FROM public.service_applications a WHERE a.service_request_id = r.id AND a.status = 'accepted') THEN 'accepted'
               ELSE r.status
           END,
           r.created_at, pr."profileSlug"
    FROM public.service_requests r
    LEFT JOIN public.profiles pr ON pr.id = r.requester_id
    WHERE public._can_access_conversation(p_conv, auth.uid())
      AND r.id IN (SELECT m.ref_request_id FROM public.direct_messages m WHERE m.conversation_id = p_conv AND m.ref_request_id IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.get_conversation_request_refs(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_request_refs(uuid) TO authenticated;
