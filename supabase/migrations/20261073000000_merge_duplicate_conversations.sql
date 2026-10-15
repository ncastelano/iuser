-- Uma sala de conversa por PAR de pessoas. Antes, a sala era "direcional" (quem puxou → com quem) e a unicidade valia só
-- para essa ordem: se A puxava B e depois B puxava A, nasciam duas salas entre as mesmas duas pessoas.
--   1) Junta as salas já duplicadas (mantém a mais antiga; move as mensagens; preserva o "não lido" de cada lado).
--   2) start_conversation passa a reaproveitar a sala do par em QUALQUER direção.
--   3) Índice único no par (sem ordem) pra isso nunca mais acontecer.
-- Lojas não mudam: já é uma sala por (cliente, loja).

CREATE OR REPLACE FUNCTION public._merge_duplicate_profile_conversations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    pair record; k public.conversations; d public.conversations;
    x uuid; y uuid;
    x_read_k timestamptz; y_read_k timestamptz; x_read_d timestamptz; y_read_d timestamptz;
    x_unread timestamptz; y_unread timestamptz;
    merged integer := 0;
BEGIN
    FOR pair IN
        SELECT LEAST(customer_id, owner_profile_id) AS a, GREATEST(customer_id, owner_profile_id) AS b
        FROM public.conversations
        WHERE owner_profile_id IS NOT NULL
        GROUP BY 1, 2
        HAVING count(*) > 1
    LOOP
        -- a sala que fica: a mais antiga
        SELECT * INTO k FROM public.conversations
        WHERE owner_profile_id IS NOT NULL
          AND LEAST(customer_id, owner_profile_id) = pair.a AND GREATEST(customer_id, owner_profile_id) = pair.b
        ORDER BY created_at, id LIMIT 1;

        FOR d IN
            SELECT * FROM public.conversations
            WHERE owner_profile_id IS NOT NULL
              AND LEAST(customer_id, owner_profile_id) = pair.a AND GREATEST(customer_id, owner_profile_id) = pair.b
              AND id <> k.id
            ORDER BY created_at, id
        LOOP
            x := k.customer_id; y := k.owner_profile_id;
            x_read_k := k.customer_read_at;
            y_read_k := COALESCE(k.owner_read_at, 'epoch'::timestamptz);
            -- na sala "d" os papéis estão trocados (o dono da sala que fica era o cliente aqui)
            IF d.customer_id = x THEN
                x_read_d := d.customer_read_at;
                y_read_d := COALESCE(d.owner_read_at, 'epoch'::timestamptz);
            ELSE
                x_read_d := COALESCE(d.owner_read_at, 'epoch'::timestamptz);
                y_read_d := d.customer_read_at;
            END IF;

            -- a primeira mensagem que cada um ainda não leu, nas duas salas
            SELECT min(m.created_at) INTO x_unread FROM public.direct_messages m
            WHERE m.sender_id <> x AND (
                (m.conversation_id = k.id AND m.created_at > x_read_k) OR (m.conversation_id = d.id AND m.created_at > x_read_d));
            SELECT min(m.created_at) INTO y_unread FROM public.direct_messages m
            WHERE m.sender_id <> y AND (
                (m.conversation_id = k.id AND m.created_at > y_read_k) OR (m.conversation_id = d.id AND m.created_at > y_read_d));

            UPDATE public.direct_messages SET conversation_id = k.id WHERE conversation_id = d.id;
            DELETE FROM public.conversations WHERE id = d.id;

            UPDATE public.conversations c SET
                customer_read_at = COALESCE(x_unread - interval '1 millisecond', GREATEST(x_read_k, x_read_d)),
                owner_read_at    = COALESCE(y_unread - interval '1 millisecond', GREATEST(y_read_k, y_read_d)),
                last_message_at  = lm.created_at,
                last_message     = left(lm.content, 140),
                last_sender_id   = lm.sender_id
            FROM (
                SELECT created_at, content, sender_id FROM public.direct_messages
                WHERE conversation_id = k.id ORDER BY created_at DESC, id DESC LIMIT 1
            ) lm
            WHERE c.id = k.id;

            merged := merged + 1;
        END LOOP;
    END LOOP;
    RETURN merged;
END; $$;
REVOKE ALL ON FUNCTION public._merge_duplicate_profile_conversations() FROM public, anon, authenticated;

SELECT public._merge_duplicate_profile_conversations();

-- Um par de pessoas = uma sala (sem importar quem puxou). Depois da junção acima, o índice é seguro.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_profile_pair_uidx ON public.conversations (
    LEAST(customer_id, owner_profile_id), GREATEST(customer_id, owner_profile_id)
) WHERE owner_profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.start_conversation(p_owner_profile uuid DEFAULT NULL, p_store uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_id uuid; v_ok boolean;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra conversar'; END IF;
    IF (p_owner_profile IS NULL) = (p_store IS NULL) THEN RAISE EXCEPTION 'Escolha um perfil ou uma loja'; END IF;

    IF p_owner_profile IS NOT NULL THEN
        IF p_owner_profile = v_user THEN RAISE EXCEPTION 'Você não pode conversar consigo mesmo'; END IF;
        -- Já existe uma sala entre as duas pessoas (quem puxou não importa)? Reaproveita.
        SELECT id INTO v_id FROM public.conversations
        WHERE (customer_id = v_user AND owner_profile_id = p_owner_profile)
           OR (customer_id = p_owner_profile AND owner_profile_id = v_user)
        LIMIT 1;
        IF v_id IS NOT NULL THEN RETURN v_id; END IF;

        SELECT chat_enabled INTO v_ok FROM public.profiles WHERE id = p_owner_profile;
        IF v_ok IS DISTINCT FROM true AND NOT public._have_accepted_service(v_user, p_owner_profile) THEN
            RAISE EXCEPTION 'Essa pessoa não está recebendo conversas';
        END IF;
        BEGIN
            INSERT INTO public.conversations (customer_id, owner_profile_id) VALUES (v_user, p_owner_profile) RETURNING id INTO v_id;
        EXCEPTION WHEN unique_violation THEN
            -- as duas pessoas abriram ao mesmo tempo: fica com a sala que ganhou a corrida
            SELECT id INTO v_id FROM public.conversations
            WHERE (customer_id = v_user AND owner_profile_id = p_owner_profile)
               OR (customer_id = p_owner_profile AND owner_profile_id = v_user)
            LIMIT 1;
        END;
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
