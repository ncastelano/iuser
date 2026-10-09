-- Chat direto: conversas entre uma pessoa (cliente) e outro PERFIL ou uma LOJA.
-- Quem quer receber conversas liga `chat_enabled` (igual ao botão de WhatsApp): só então a página dele mostra "Conversar".
-- Tudo passa por funções/policies: só participam da conversa o cliente, o perfil procurado ou o dono da loja.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chat_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.stores   ADD COLUMN IF NOT EXISTS chat_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,       -- quem puxou a conversa
    owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,            -- conversa com um perfil...
    store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,                      -- ...ou com uma loja
    created_at timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz,
    last_message text,
    last_sender_id uuid,
    customer_read_at timestamptz NOT NULL DEFAULT now(),
    owner_read_at timestamptz,
    CONSTRAINT conversations_one_target CHECK ((owner_profile_id IS NULL) <> (store_id IS NULL)),
    CONSTRAINT conversations_not_self CHECK (owner_profile_id IS NULL OR owner_profile_id <> customer_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_customer_profile_uidx ON public.conversations (customer_id, owner_profile_id) WHERE owner_profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_customer_store_uidx   ON public.conversations (customer_id, store_id) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversations_owner_profile_idx ON public.conversations (owner_profile_id, last_message_at DESC) WHERE owner_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversations_store_idx ON public.conversations (store_id, last_message_at DESC) WHERE store_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.direct_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS direct_messages_conv_idx ON public.direct_messages (conversation_id, created_at);

-- Quem participa: o cliente, o perfil procurado ou o dono da loja
CREATE OR REPLACE FUNCTION public._can_access_conversation(p_conv uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_user IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = p_conv
          AND (c.customer_id = p_user
               OR c.owner_profile_id = p_user
               OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = c.store_id AND s.owner_id = p_user))
    );
$$;
REVOKE ALL ON FUNCTION public._can_access_conversation(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._can_access_conversation(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participantes veem a conversa" ON public.conversations;
CREATE POLICY "Participantes veem a conversa" ON public.conversations FOR SELECT TO authenticated
    USING (public._can_access_conversation(id, auth.uid()));

DROP POLICY IF EXISTS "Participantes veem as mensagens" ON public.direct_messages;
CREATE POLICY "Participantes veem as mensagens" ON public.direct_messages FOR SELECT TO authenticated
    USING (public._can_access_conversation(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Participantes enviam mensagens" ON public.direct_messages;
CREATE POLICY "Participantes enviam mensagens" ON public.direct_messages FOR INSERT TO authenticated
    WITH CHECK (sender_id = auth.uid() AND public._can_access_conversation(conversation_id, auth.uid()));
-- Sem policy de escrita em conversations: só pelas funções abaixo e pelo gatilho.

-- Cada mensagem atualiza a prévia da conversa e já conta como lida pra quem enviou
CREATE OR REPLACE FUNCTION public.trg_direct_message_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.conversations;
BEGIN
    SELECT * INTO c FROM public.conversations WHERE id = NEW.conversation_id;
    UPDATE public.conversations SET
        last_message_at = NEW.created_at,
        last_message = left(NEW.content, 140),
        last_sender_id = NEW.sender_id,
        customer_read_at = CASE WHEN NEW.sender_id = c.customer_id THEN NEW.created_at ELSE customer_read_at END,
        owner_read_at = CASE WHEN NEW.sender_id <> c.customer_id THEN NEW.created_at ELSE owner_read_at END
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS direct_messages_after_insert ON public.direct_messages;
CREATE TRIGGER direct_messages_after_insert AFTER INSERT ON public.direct_messages
    FOR EACH ROW EXECUTE FUNCTION public.trg_direct_message_after_insert();

-- Começar (ou retomar) uma conversa: só com quem ligou o chat
CREATE OR REPLACE FUNCTION public.start_conversation(p_owner_profile uuid DEFAULT NULL, p_store uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_id uuid; v_ok boolean;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra conversar'; END IF;
    IF (p_owner_profile IS NULL) = (p_store IS NULL) THEN RAISE EXCEPTION 'Escolha um perfil ou uma loja'; END IF;

    IF p_owner_profile IS NOT NULL THEN
        IF p_owner_profile = v_user THEN RAISE EXCEPTION 'Você não pode conversar consigo mesmo'; END IF;
        SELECT chat_enabled INTO v_ok FROM public.profiles WHERE id = p_owner_profile;
        IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Essa pessoa não está recebendo conversas'; END IF;
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

-- Marcar como lida (do meu lado)
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conv uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); c public.conversations;
BEGIN
    IF NOT public._can_access_conversation(p_conv, v_user) THEN RETURN; END IF;
    SELECT * INTO c FROM public.conversations WHERE id = p_conv;
    IF c.customer_id = v_user THEN
        UPDATE public.conversations SET customer_read_at = now() WHERE id = p_conv;
    ELSE
        UPDATE public.conversations SET owner_read_at = now() WHERE id = p_conv;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- Lista de conversas.
--   p_scope = 'profile': as minhas (as que eu puxei e as que pessoas puxaram comigo)
--   p_scope = 'store'  : as da loja p_store (só o dono vê)
-- Cada linha já traz a "outra ponta" (nome, @, foto) e quantas mensagens não li.
CREATE OR REPLACE FUNCTION public.get_my_conversations(p_scope text DEFAULT 'profile', p_store uuid DEFAULT NULL)
RETURNS TABLE(
    id uuid, role text, store_id uuid, last_message text, last_message_at timestamptz, last_sender_id uuid, unread bigint,
    other_id uuid, other_name text, other_slug text, other_avatar text, other_is_store boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
    IF v_user IS NULL THEN RETURN; END IF;
    IF p_scope = 'store' THEN
        IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store AND s.owner_id = v_user) THEN RETURN; END IF;
        RETURN QUERY
        SELECT c.id, 'store_owner'::text, c.store_id, c.last_message, c.last_message_at, c.last_sender_id,
               (SELECT count(*) FROM public.direct_messages m WHERE m.conversation_id = c.id AND m.sender_id <> v_user
                   AND m.created_at > COALESCE(c.owner_read_at, 'epoch'::timestamptz)),
               p.id, p.name, p."profileSlug", p.avatar_url, false
        FROM public.conversations c JOIN public.profiles p ON p.id = c.customer_id
        WHERE c.store_id = p_store
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC;
    ELSE
        RETURN QUERY
        SELECT c.id,
               CASE WHEN c.customer_id = v_user THEN 'customer' ELSE 'profile_owner' END,
               c.store_id, c.last_message, c.last_message_at, c.last_sender_id,
               (SELECT count(*) FROM public.direct_messages m WHERE m.conversation_id = c.id AND m.sender_id <> v_user
                   AND m.created_at > CASE WHEN c.customer_id = v_user THEN c.customer_read_at ELSE COALESCE(c.owner_read_at, 'epoch'::timestamptz) END),
               CASE WHEN c.customer_id <> v_user THEN cp.id WHEN c.store_id IS NOT NULL THEN st.id ELSE op.id END,
               CASE WHEN c.customer_id <> v_user THEN cp.name WHEN c.store_id IS NOT NULL THEN st.name ELSE op.name END,
               CASE WHEN c.customer_id <> v_user THEN cp."profileSlug" WHEN c.store_id IS NOT NULL THEN st."storeSlug" ELSE op."profileSlug" END,
               CASE WHEN c.customer_id <> v_user THEN cp.avatar_url WHEN c.store_id IS NOT NULL THEN st.logo_url ELSE op.avatar_url END,
               (c.customer_id = v_user AND c.store_id IS NOT NULL)
        FROM public.conversations c
        JOIN public.profiles cp ON cp.id = c.customer_id
        LEFT JOIN public.profiles op ON op.id = c.owner_profile_id
        LEFT JOIN public.stores st ON st.id = c.store_id
        WHERE c.customer_id = v_user OR c.owner_profile_id = v_user
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.get_my_conversations(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_conversations(text, uuid) TO authenticated;

-- Quantas conversas têm mensagem nova pra mim (selo do ícone de chat no cabeçalho), em todos os papéis
CREATE OR REPLACE FUNCTION public.get_my_chat_unread_total()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT count(*) FROM public.conversations c
    WHERE auth.uid() IS NOT NULL
      AND (c.customer_id = auth.uid() OR c.owner_profile_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = c.store_id AND s.owner_id = auth.uid()))
      AND EXISTS (
          SELECT 1 FROM public.direct_messages m
          WHERE m.conversation_id = c.id AND m.sender_id <> auth.uid()
            AND m.created_at > CASE WHEN c.customer_id = auth.uid() THEN c.customer_read_at ELSE COALESCE(c.owner_read_at, 'epoch'::timestamptz) END
      );
$$;
REVOKE ALL ON FUNCTION public.get_my_chat_unread_total() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_chat_unread_total() TO authenticated;

-- Mensagens chegando na hora (o Realtime respeita as policies acima)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'direct_messages') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
        END IF;
    END IF;
END $$;
