-- Conversa a partir de um pedido de serviço: quem clica em "iUser" nos detalhes do pedido (ou no card de quem foi
-- escolhido) abre o chat com a outra ponta e já manda uma mensagem-cartão com o pedido (tipo, descrição, local, foto).

ALTER TABLE public.direct_messages
    ADD COLUMN IF NOT EXISTS ref_request_id uuid REFERENCES public.service_requests(id) ON DELETE SET NULL;

-- p_application = a candidatura (a ligação entre quem pediu e quem quer/foi escolhido a fazer).
-- Vale pros dois lados: quem pediu fala com o candidato; o candidato fala com quem pediu.
-- Não repete o mesmo cartão se a pessoa já mandou nas últimas 12 horas (clicar de novo só abre a conversa).
CREATE OR REPLACE FUNCTION public.start_conversation_about_request(p_application uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user uuid := auth.uid();
    a public.service_applications;
    r public.service_requests;
    v_other uuid;
    v_conv uuid;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra conversar'; END IF;
    SELECT * INTO a FROM public.service_applications WHERE id = p_application;
    IF NOT FOUND THEN RAISE EXCEPTION 'Candidatura não encontrada'; END IF;
    SELECT * INTO r FROM public.service_requests WHERE id = a.service_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

    IF v_user = r.requester_id THEN v_other := a.applicant_id;
    ELSIF v_user = a.applicant_id THEN v_other := r.requester_id;
    ELSE RAISE EXCEPTION 'Você não participa desse pedido';
    END IF;

    v_conv := public.start_conversation(v_other, NULL);

    IF NOT EXISTS (
        SELECT 1 FROM public.direct_messages
        WHERE conversation_id = v_conv AND sender_id = v_user AND ref_request_id = r.id
          AND created_at > now() - interval '12 hours'
    ) THEN
        INSERT INTO public.direct_messages (conversation_id, sender_id, content, ref_request_id)
        VALUES (
            v_conv, v_user,
            CASE WHEN v_user = r.requester_id
                 THEN 'Olá! Estou te chamando sobre o meu pedido de serviço aqui no iUser.'
                 ELSE 'Olá! Estou te chamando sobre o seu pedido de serviço aqui no iUser.' END,
            r.id
        );
    END IF;
    RETURN v_conv;
END; $$;
REVOKE ALL ON FUNCTION public.start_conversation_about_request(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_conversation_about_request(uuid) TO authenticated;

-- Os pedidos citados nas mensagens de uma conversa (só pra quem participa dela)
CREATE OR REPLACE FUNCTION public.get_conversation_request_refs(p_conv uuid)
RETURNS TABLE (
    id uuid, service_type text, custom_service text, description text, location_address text,
    photo_urls text[], status text, created_at timestamptz, requester_slug text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT r.id, r.service_type, r.custom_service, r.description, r.location_address,
           r.photo_urls, r.status, r.created_at, pr."profileSlug"
    FROM public.service_requests r
    LEFT JOIN public.profiles pr ON pr.id = r.requester_id
    WHERE public._can_access_conversation(p_conv, auth.uid())
      AND r.id IN (SELECT m.ref_request_id FROM public.direct_messages m WHERE m.conversation_id = p_conv AND m.ref_request_id IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.get_conversation_request_refs(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_request_refs(uuid) TO authenticated;
