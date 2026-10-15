-- Conversas em GRUPO. A sala 1 a 1 continua exatamente como é (uma por par de pessoas); o grupo é uma sala nova
-- (kind = 'group') com uma tabela de membros. Entrar é por CONVITE (aceitar/recusar): ninguém é colocado num grupo sem querer.
--   * conversation_members: quem está, com que papel e até onde leu (o "não lido" é por pessoa).
--   * Mensagens seguem em direct_messages; o acesso passa a incluir os membros ATIVOS do grupo.
--   * Tudo que escreve é por função (create_group_conversation, invite_to_group, respond_group_invite, leave_group,
--     remove_group_member, update_group, set_group_muted); não há policy de escrita.
-- Limite: 30 pessoas por grupo; quem criou é admin e pode convidar, remover e renomear.

-- ===== Sala: tipo, título e foto =====
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'direct';
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_kind_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_kind_check CHECK (kind IN ('direct', 'group'));
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_one_target;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_one_target CHECK (
    (kind = 'group' AND owner_profile_id IS NULL AND store_id IS NULL AND title IS NOT NULL)
    OR (kind = 'direct' AND (owner_profile_id IS NULL) <> (store_id IS NULL))
);

-- ===== Membros =====
CREATE TABLE IF NOT EXISTS public.conversation_members (
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'declined', 'left', 'removed')),
    invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    joined_at timestamptz,
    last_read_at timestamptz NOT NULL DEFAULT now(),
    muted boolean NOT NULL DEFAULT false,
    push_sent_at timestamptz,
    PRIMARY KEY (conversation_id, profile_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_profile_idx ON public.conversation_members (profile_id, status);
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._is_active_member(p_conv uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_user IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = p_conv AND cm.profile_id = p_user AND cm.status = 'active'
    );
$$;
REVOKE ALL ON FUNCTION public._is_active_member(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._is_active_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Membros veem o grupo" ON public.conversation_members;
CREATE POLICY "Membros veem o grupo" ON public.conversation_members FOR SELECT TO authenticated
    USING (profile_id = auth.uid() OR public._is_active_member(conversation_id, auth.uid()));

-- Acesso à sala: cliente, perfil procurado, dono da loja OU membro ativo do grupo
CREATE OR REPLACE FUNCTION public._can_access_conversation(p_conv uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_user IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = p_conv
          AND (
              (c.kind = 'direct' AND (c.customer_id = p_user
                   OR c.owner_profile_id = p_user
                   OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = c.store_id AND s.owner_id = p_user)))
              OR (c.kind = 'group' AND EXISTS (
                   SELECT 1 FROM public.conversation_members cm
                   WHERE cm.conversation_id = c.id AND cm.profile_id = p_user AND cm.status = 'active'))
          )
    );
$$;

-- Aviso na central de notificações: convite de grupo
DO $$
DECLARE v_name text;
BEGIN
    SELECT conname INTO v_name FROM pg_constraint
    WHERE conrelid = 'public.profile_notifications'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%kind%';
    IF v_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.profile_notifications DROP CONSTRAINT %I', v_name);
    END IF;
    ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
        'follow','profile_view','link_visit','publication_like','service_like','product_like','publication_comment',
        'profile_comment','comment_reply','comment_like','invite_signup','service_application','service_selected',
        'service_completed','service_review','ride_application','ride_selected','ride_review','customer_review',
        'appointment_new','appointment_confirmed','appointment_cancelled','appointment_changed','group_invite'
    ]));
END $$;

-- ===== Mensagem nova: prévia da sala e "lido" de quem enviou =====
CREATE OR REPLACE FUNCTION public.trg_direct_message_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.conversations;
BEGIN
    SELECT * INTO c FROM public.conversations WHERE id = NEW.conversation_id;
    IF c.kind = 'group' THEN
        UPDATE public.conversations SET
            last_message_at = NEW.created_at, last_message = left(NEW.content, 140), last_sender_id = NEW.sender_id
        WHERE id = NEW.conversation_id;
        UPDATE public.conversation_members SET last_read_at = NEW.created_at
        WHERE conversation_id = NEW.conversation_id AND profile_id = NEW.sender_id;
    ELSE
        UPDATE public.conversations SET
            last_message_at = NEW.created_at,
            last_message = left(NEW.content, 140),
            last_sender_id = NEW.sender_id,
            customer_read_at = CASE WHEN NEW.sender_id = c.customer_id THEN NEW.created_at ELSE customer_read_at END,
            owner_read_at = CASE WHEN NEW.sender_id <> c.customer_id THEN NEW.created_at ELSE owner_read_at END
        WHERE id = NEW.conversation_id;
    END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conv uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); c public.conversations;
BEGIN
    IF NOT public._can_access_conversation(p_conv, v_user) THEN RETURN; END IF;
    SELECT * INTO c FROM public.conversations WHERE id = p_conv;
    IF c.kind = 'group' THEN
        UPDATE public.conversation_members SET last_read_at = now() WHERE conversation_id = p_conv AND profile_id = v_user;
    ELSIF c.customer_id = v_user THEN
        UPDATE public.conversations SET customer_read_at = now() WHERE id = p_conv;
    ELSE
        UPDATE public.conversations SET owner_read_at = now() WHERE id = p_conv;
    END IF;
END; $$;

-- ===== Lista de conversas: agora com os grupos =====
DROP FUNCTION IF EXISTS public.get_my_conversations(text, uuid);
CREATE OR REPLACE FUNCTION public.get_my_conversations(p_scope text DEFAULT 'profile', p_store uuid DEFAULT NULL)
RETURNS TABLE(
    id uuid, role text, store_id uuid, last_message text, last_message_at timestamptz, last_sender_id uuid, unread bigint,
    other_id uuid, other_name text, other_slug text, other_avatar text, other_is_store boolean,
    is_group boolean, member_count bigint
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
               p.id, p.name, p."profileSlug", p.avatar_url, false, false, 0::bigint
        FROM public.conversations c JOIN public.profiles p ON p.id = c.customer_id
        WHERE c.store_id = p_store AND c.kind = 'direct'
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC;
    ELSE
        RETURN QUERY
        SELECT t.id, t.role, t.store_id, t.last_message, t.last_message_at, t.last_sender_id, t.unread,
               t.other_id, t.other_name, t.other_slug, t.other_avatar, t.other_is_store, t.is_group, t.member_count
        FROM (
            SELECT c.id,
                   (CASE WHEN c.customer_id = v_user THEN 'customer' ELSE 'profile_owner' END)::text AS role,
                   c.store_id, c.last_message, c.last_message_at, c.last_sender_id,
                   (SELECT count(*) FROM public.direct_messages m WHERE m.conversation_id = c.id AND m.sender_id <> v_user
                       AND m.created_at > CASE WHEN c.customer_id = v_user THEN c.customer_read_at ELSE COALESCE(c.owner_read_at, 'epoch'::timestamptz) END) AS unread,
                   CASE WHEN c.customer_id <> v_user THEN cp.id WHEN c.store_id IS NOT NULL THEN st.id ELSE op.id END AS other_id,
                   CASE WHEN c.customer_id <> v_user THEN cp.name WHEN c.store_id IS NOT NULL THEN st.name ELSE op.name END AS other_name,
                   CASE WHEN c.customer_id <> v_user THEN cp."profileSlug" WHEN c.store_id IS NOT NULL THEN st."storeSlug" ELSE op."profileSlug" END AS other_slug,
                   CASE WHEN c.customer_id <> v_user THEN cp.avatar_url WHEN c.store_id IS NOT NULL THEN st.logo_url ELSE op.avatar_url END AS other_avatar,
                   (c.customer_id = v_user AND c.store_id IS NOT NULL) AS other_is_store,
                   false AS is_group, 0::bigint AS member_count,
                   COALESCE(c.last_message_at, c.created_at) AS sort_at
            FROM public.conversations c
            JOIN public.profiles cp ON cp.id = c.customer_id
            LEFT JOIN public.profiles op ON op.id = c.owner_profile_id
            LEFT JOIN public.stores st ON st.id = c.store_id
            WHERE c.kind = 'direct' AND (c.customer_id = v_user OR c.owner_profile_id = v_user)
            UNION ALL
            SELECT c.id, 'member'::text, NULL::uuid, c.last_message, c.last_message_at, c.last_sender_id,
                   (SELECT count(*) FROM public.direct_messages m WHERE m.conversation_id = c.id AND m.sender_id <> v_user
                       AND m.created_at > cm.last_read_at),
                   c.id, c.title, NULL::text, c.avatar_url, false,
                   true, (SELECT count(*) FROM public.conversation_members x WHERE x.conversation_id = c.id AND x.status = 'active'),
                   COALESCE(c.last_message_at, c.created_at)
            FROM public.conversations c
            JOIN public.conversation_members cm ON cm.conversation_id = c.id AND cm.profile_id = v_user AND cm.status = 'active'
            WHERE c.kind = 'group'
        ) t
        ORDER BY t.sort_at DESC;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.get_my_conversations(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_conversations(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_chat_unread_total()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT count(*) FROM public.conversations c
    WHERE auth.uid() IS NOT NULL
      AND (
        (c.kind = 'direct'
          AND (c.customer_id = auth.uid() OR c.owner_profile_id = auth.uid()
               OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = c.store_id AND s.owner_id = auth.uid()))
          AND EXISTS (
              SELECT 1 FROM public.direct_messages m
              WHERE m.conversation_id = c.id AND m.sender_id <> auth.uid()
                AND m.created_at > CASE WHEN c.customer_id = auth.uid() THEN c.customer_read_at ELSE COALESCE(c.owner_read_at, 'epoch'::timestamptz) END))
        OR
        (c.kind = 'group' AND EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = c.id AND cm.profile_id = auth.uid() AND cm.status = 'active'
              AND EXISTS (SELECT 1 FROM public.direct_messages m
                          WHERE m.conversation_id = c.id AND m.sender_id <> auth.uid() AND m.created_at > cm.last_read_at)))
      );
$$;

-- ===== Criar grupo =====
CREATE OR REPLACE FUNCTION public.create_group_conversation(p_title text, p_members uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user uuid := auth.uid(); v_id uuid; v_title text := btrim(COALESCE(p_title, ''));
    v_members uuid[]; m uuid;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra criar um grupo'; END IF;
    IF char_length(v_title) < 1 OR char_length(v_title) > 60 THEN RAISE EXCEPTION 'Dê um nome ao grupo (até 60 letras)'; END IF;
    SELECT array_agg(DISTINCT x) INTO v_members FROM unnest(COALESCE(p_members, ARRAY[]::uuid[])) x
    WHERE x IS NOT NULL AND x <> v_user AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x);
    IF COALESCE(array_length(v_members, 1), 0) < 2 THEN RAISE EXCEPTION 'Escolha pelo menos 2 pessoas (com uma só, é uma conversa normal)'; END IF;
    IF array_length(v_members, 1) > 29 THEN RAISE EXCEPTION 'Um grupo tem no máximo 30 pessoas'; END IF;
    IF (SELECT count(*) FROM public.conversations WHERE kind = 'group' AND customer_id = v_user AND created_at > now() - interval '1 day') >= 20 THEN
        RAISE EXCEPTION 'Muitos grupos criados hoje. Tente de novo amanhã.';
    END IF;

    INSERT INTO public.conversations (customer_id, kind, title) VALUES (v_user, 'group', left(v_title, 60)) RETURNING id INTO v_id;
    INSERT INTO public.conversation_members (conversation_id, profile_id, role, status, joined_at)
    VALUES (v_id, v_user, 'admin', 'active', now());
    FOREACH m IN ARRAY v_members LOOP
        INSERT INTO public.conversation_members (conversation_id, profile_id, role, status, invited_by)
        VALUES (v_id, m, 'member', 'invited', v_user);
        BEGIN
            PERFORM public._notify(m, 'group_invite', v_user, v_id, jsonb_build_object('title', left(v_title, 60)), 'ginv:' || v_id || ':' || m);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END LOOP;
    RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_group_conversation(text, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[]) TO authenticated;

-- ===== Convidar mais gente (admin) =====
CREATE OR REPLACE FUNCTION public.invite_to_group(p_conv uuid, p_members uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); m uuid; v_title text; v_count integer; v_new integer := 0; v_status text;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conv AND profile_id = v_user AND status = 'active' AND role = 'admin') THEN
        RAISE EXCEPTION 'Só quem administra o grupo pode convidar';
    END IF;
    SELECT title INTO v_title FROM public.conversations WHERE id = p_conv AND kind = 'group';
    IF v_title IS NULL THEN RAISE EXCEPTION 'Grupo não encontrado'; END IF;
    FOREACH m IN ARRAY COALESCE(p_members, ARRAY[]::uuid[]) LOOP
        CONTINUE WHEN m IS NULL OR m = v_user OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = m);
        SELECT status INTO v_status FROM public.conversation_members WHERE conversation_id = p_conv AND profile_id = m;
        CONTINUE WHEN v_status IN ('active', 'invited');
        SELECT count(*) INTO v_count FROM public.conversation_members WHERE conversation_id = p_conv AND status IN ('active', 'invited');
        IF v_count >= 30 THEN RAISE EXCEPTION 'Um grupo tem no máximo 30 pessoas'; END IF;
        INSERT INTO public.conversation_members (conversation_id, profile_id, role, status, invited_by, push_sent_at)
        VALUES (p_conv, m, 'member', 'invited', v_user, NULL)
        ON CONFLICT (conversation_id, profile_id) DO UPDATE
            SET status = 'invited', invited_by = v_user, push_sent_at = NULL, created_at = now();
        BEGIN
            PERFORM public._notify(m, 'group_invite', v_user, p_conv, jsonb_build_object('title', v_title), 'ginv:' || p_conv || ':' || m || ':' || extract(epoch FROM now())::bigint);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        v_new := v_new + 1;
    END LOOP;
    RETURN v_new;
END; $$;
REVOKE ALL ON FUNCTION public.invite_to_group(uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.invite_to_group(uuid, uuid[]) TO authenticated;

-- ===== Aceitar ou recusar o convite =====
CREATE OR REPLACE FUNCTION public.respond_group_invite(p_conv uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    IF p_accept THEN
        UPDATE public.conversation_members
        SET status = 'active', joined_at = now(), last_read_at = now()
        WHERE conversation_id = p_conv AND profile_id = v_user AND status = 'invited';
    ELSE
        UPDATE public.conversation_members SET status = 'declined'
        WHERE conversation_id = p_conv AND profile_id = v_user AND status = 'invited';
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.respond_group_invite(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.respond_group_invite(uuid, boolean) TO authenticated;

-- ===== Sair do grupo (se era o único admin, o membro mais antigo assume) =====
CREATE OR REPLACE FUNCTION public.leave_group(p_conv uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_was_admin boolean; v_next uuid;
BEGIN
    IF v_user IS NULL THEN RETURN; END IF;
    SELECT (role = 'admin') INTO v_was_admin FROM public.conversation_members
    WHERE conversation_id = p_conv AND profile_id = v_user AND status = 'active';
    IF v_was_admin IS NULL THEN RETURN; END IF;
    UPDATE public.conversation_members SET status = 'left', role = 'member'
    WHERE conversation_id = p_conv AND profile_id = v_user;
    IF v_was_admin AND NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conv AND status = 'active' AND role = 'admin') THEN
        SELECT profile_id INTO v_next FROM public.conversation_members
        WHERE conversation_id = p_conv AND status = 'active' ORDER BY joined_at, created_at LIMIT 1;
        IF v_next IS NOT NULL THEN
            UPDATE public.conversation_members SET role = 'admin' WHERE conversation_id = p_conv AND profile_id = v_next;
        END IF;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.leave_group(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leave_group(uuid) TO authenticated;

-- ===== Remover alguém (admin) =====
CREATE OR REPLACE FUNCTION public.remove_group_member(p_conv uuid, p_profile uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conv AND profile_id = v_user AND status = 'active' AND role = 'admin') THEN
        RAISE EXCEPTION 'Só quem administra o grupo pode remover pessoas';
    END IF;
    IF p_profile = v_user THEN RAISE EXCEPTION 'Para sair, use "Sair do grupo"'; END IF;
    UPDATE public.conversation_members SET status = 'removed', role = 'member'
    WHERE conversation_id = p_conv AND profile_id = p_profile AND status IN ('active', 'invited');
END; $$;
REVOKE ALL ON FUNCTION public.remove_group_member(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.remove_group_member(uuid, uuid) TO authenticated;

-- ===== Renomear (admin) =====
CREATE OR REPLACE FUNCTION public.update_group(p_conv uuid, p_title text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_title text := btrim(COALESCE(p_title, ''));
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conv AND profile_id = v_user AND status = 'active' AND role = 'admin') THEN
        RAISE EXCEPTION 'Só quem administra o grupo pode mudar o nome';
    END IF;
    IF char_length(v_title) < 1 OR char_length(v_title) > 60 THEN RAISE EXCEPTION 'Dê um nome ao grupo (até 60 letras)'; END IF;
    UPDATE public.conversations SET title = v_title WHERE id = p_conv AND kind = 'group';
END; $$;
REVOKE ALL ON FUNCTION public.update_group(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_group(uuid, text) TO authenticated;

-- ===== Silenciar os avisos do grupo (só pra mim) =====
CREATE OR REPLACE FUNCTION public.set_group_muted(p_conv uuid, p_muted boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE public.conversation_members SET muted = COALESCE(p_muted, false)
    WHERE conversation_id = p_conv AND profile_id = auth.uid() AND status = 'active';
$$;
REVOKE ALL ON FUNCTION public.set_group_muted(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_group_muted(uuid, boolean) TO authenticated;

-- ===== Quem está no grupo (só membros ativos veem) =====
CREATE OR REPLACE FUNCTION public.get_group_members(p_conv uuid)
RETURNS TABLE(profile_id uuid, name text, profile_slug text, avatar_url text, role text, status text, muted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.name, p."profileSlug", p.avatar_url, cm.role, cm.status,
           (cm.profile_id = auth.uid() AND cm.muted)
    FROM public.conversation_members cm
    JOIN public.profiles p ON p.id = cm.profile_id
    WHERE cm.conversation_id = p_conv
      AND public._is_active_member(p_conv, auth.uid())
      AND cm.status IN ('active', 'invited')
    ORDER BY (cm.role = 'admin') DESC, (cm.status = 'active') DESC, cm.joined_at NULLS LAST, cm.created_at;
$$;
REVOKE ALL ON FUNCTION public.get_group_members(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_group_members(uuid) TO authenticated;

-- ===== Meus convites pendentes =====
CREATE OR REPLACE FUNCTION public.get_my_group_invites()
RETURNS TABLE(conversation_id uuid, title text, invited_by uuid, inviter_name text, inviter_slug text, inviter_avatar text, member_count bigint, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT c.id, c.title, cm.invited_by, ip.name, ip."profileSlug", ip.avatar_url,
           (SELECT count(*) FROM public.conversation_members x WHERE x.conversation_id = c.id AND x.status = 'active'),
           cm.created_at
    FROM public.conversation_members cm
    JOIN public.conversations c ON c.id = cm.conversation_id AND c.kind = 'group'
    LEFT JOIN public.profiles ip ON ip.id = cm.invited_by
    WHERE cm.profile_id = auth.uid() AND cm.status = 'invited'
    ORDER BY cm.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_my_group_invites() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_group_invites() TO authenticated;

-- Realtime da lista de membros (convites chegando na hora) respeita a policy acima
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversation_members') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
    END IF;
END $$;
