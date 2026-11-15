-- MODERAÇÃO: denunciar e ocultar conteúdo das pessoas (flash, comentário do flash, publicação, comentário, avaliação de produto, mensagem de comunidade).
--   content_reports    : cada denúncia (quem, o quê, por quê); uma por pessoa e conteúdo; no máximo 20 por pessoa a cada 24 h.
--   content_moderation : o estado de um conteúdo: 'hidden' (oculto) ou 'cleared' (o admin analisou e MANTEVE — nunca mais é ocultado por denúncias).
--   OCULTAR vale NO BANCO (para todo mundo, inclusive pelas políticas de leitura): flashes, comentários e mensagens somem das consultas; a publicação vira is_active = false (e volta
--   ao restaurar, se estava ativa). Auto-ocultar: 3 pessoas DIFERENTES (contas com mais de 1 dia, nenhuma é o autor) denunciam → fica oculto até o admin decidir em Admin → Denúncias.
--   O autor é avisado (moderation_update). O admin pode ocultar, manter (cleared) ou restaurar. Tabelas sem acesso do app (tudo por função).
-- Rollback: supabase/rollbacks/moderation_rollback.sql

ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup', 'service_application',
    'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review',
    'customer_review', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered', 'delivery_driver_assigned',
    'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready', 'delivery_completed', 'delivery_done',
    'delivery_driver_cancelled', 'delivery_cancelled', 'delivery_at_door', 'delivery_message', 'delivery_issue',
    'favorite_invite', 'favorite_accepted', 'favorite_declined',
    'dues_update', 'dispute_update',
    'moderation_update'
]));

-- o aviso ao autor também vira push (mesma lista do gatilho da 20261130000010/12)
CREATE OR REPLACE FUNCTION public.trg_ping_live_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.kind = ANY (ARRAY[
        'delivery_driver_assigned', 'delivery_picked_up', 'delivery_at_door', 'delivery_message', 'delivery_issue',
        'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_driver_cancelled', 'delivery_cancelled',
        'delivery_order_ready', 'delivery_completed',
        'favorite_invite', 'favorite_accepted', 'favorite_declined',
        'dues_update', 'dispute_update',
        'moderation_update'
    ]) THEN
        PERFORM public._ping_delivery_events();
    END IF;
    RETURN NEW;
END; $$;

CREATE TABLE IF NOT EXISTS public.content_reports (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_type text NOT NULL CHECK (target_type IN ('flash', 'flash_comment', 'publication', 'comment', 'product_review', 'community_message')),
    target_id   uuid NOT NULL,
    reason      text NOT NULL CHECK (reason IN ('spam', 'offensive', 'sexual', 'violence', 'scam', 'illegal', 'other')),
    note        text CHECK (note IS NULL OR char_length(note) <= 300),
    reviewed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS content_reports_target_idx ON public.content_reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS content_reports_reporter_idx ON public.content_reports (reporter_id, created_at);
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_reports FROM anon, authenticated;
GRANT ALL ON public.content_reports TO service_role;

CREATE TABLE IF NOT EXISTS public.content_moderation (
    target_type    text NOT NULL,
    target_id      uuid NOT NULL,
    status         text NOT NULL CHECK (status IN ('hidden', 'cleared')),
    source         text NOT NULL CHECK (source IN ('reports', 'admin')),
    author_id      uuid,
    note           text CHECK (note IS NULL OR char_length(note) <= 500),
    restore_active boolean NOT NULL DEFAULT false,   -- publicação: estava ativa antes de ocultar (volta ao restaurar)
    decided_by     uuid,
    decided_at     timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (target_type, target_id)
);
CREATE INDEX IF NOT EXISTS content_moderation_author_idx ON public.content_moderation (author_id, status);
ALTER TABLE public.content_moderation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_moderation FROM anon, authenticated;
GRANT ALL ON public.content_moderation TO service_role;

-- está oculto? (as políticas de leitura usam esta função, então ela roda como o dono das tabelas)
CREATE OR REPLACE FUNCTION public._is_hidden(p_type text, p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.content_moderation WHERE target_type = p_type AND target_id = p_id AND status = 'hidden')
$$;
GRANT EXECUTE ON FUNCTION public._is_hidden(text, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._content_author(p_type text, p_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE p_type
        WHEN 'flash' THEN (SELECT author_id FROM public.flashes WHERE id = p_id)
        WHEN 'flash_comment' THEN (SELECT author_id FROM public.flash_comments WHERE id = p_id)
        WHEN 'publication' THEN (SELECT owner_id FROM public.products WHERE id = p_id AND listing_type = 'publication')
        WHEN 'comment' THEN (SELECT profile_id FROM public.comments WHERE id = p_id)
        WHEN 'product_review' THEN (SELECT profile_id FROM public.product_reviews WHERE id = p_id)
        WHEN 'community_message' THEN (SELECT profile_id FROM public.community_messages WHERE id = p_id)
    END
$$;
REVOKE ALL ON FUNCTION public._content_author(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._content_label(p_type text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_type WHEN 'flash' THEN 'flash' WHEN 'flash_comment' THEN 'comentário do seu flash' WHEN 'publication' THEN 'publicação'
                       WHEN 'comment' THEN 'comentário' WHEN 'product_review' THEN 'avaliação' WHEN 'community_message' THEN 'mensagem da comunidade' ELSE 'conteúdo' END
$$;

-- efeito colateral de ocultar/restaurar: publicação = is_active
CREATE OR REPLACE FUNCTION public._moderation_apply(p_type text, p_id uuid, p_hide boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
    IF p_type <> 'publication' THEN RETURN; END IF;
    IF p_hide THEN
        UPDATE public.products SET is_active = false WHERE id = p_id AND is_active;
        GET DIAGNOSTICS n = ROW_COUNT;
        UPDATE public.content_moderation SET restore_active = (n > 0) WHERE target_type = p_type AND target_id = p_id;
    ELSE
        UPDATE public.products SET is_active = true WHERE id = p_id AND EXISTS (SELECT 1 FROM public.content_moderation WHERE target_type = p_type AND target_id = p_id AND restore_active);
        UPDATE public.content_moderation SET restore_active = false WHERE target_type = p_type AND target_id = p_id;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public._moderation_apply(text, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- DENUNCIAR (qualquer pessoa logada, menos o autor)
CREATE OR REPLACE FUNCTION public.report_content(p_type text, p_id uuid, p_reason text, p_note text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_author uuid; n integer; v_n integer;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Entre para denunciar' USING ERRCODE = '42501'; END IF;
    IF p_type NOT IN ('flash', 'flash_comment', 'publication', 'comment', 'product_review', 'community_message') THEN RAISE EXCEPTION 'Tipo inválido' USING ERRCODE = '22023'; END IF;
    IF p_reason NOT IN ('spam', 'offensive', 'sexual', 'violence', 'scam', 'illegal', 'other') THEN RAISE EXCEPTION 'Motivo inválido' USING ERRCODE = '22023'; END IF;
    v_author := public._content_author(p_type, p_id);
    IF v_author IS NULL THEN RAISE EXCEPTION 'Conteúdo não encontrado' USING ERRCODE = '22023'; END IF;
    IF v_author = uid THEN RAISE EXCEPTION 'Você não pode denunciar o que é seu' USING ERRCODE = '22023'; END IF;
    IF (SELECT count(*) FROM public.content_reports WHERE reporter_id = uid AND created_at > now() - interval '24 hours') >= 20 THEN
        RAISE EXCEPTION 'Você já fez muitas denúncias hoje. Tente amanhã.' USING ERRCODE = '22023', HINT = 'report_limit';
    END IF;
    INSERT INTO public.content_reports (reporter_id, target_type, target_id, reason, note) VALUES (uid, p_type, p_id, p_reason, NULLIF(left(btrim(COALESCE(p_note, '')), 300), ''))
    ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN RETURN 'already'; END IF;
    -- 3 pessoas DIFERENTES (contas com mais de 1 dia) → oculta até o admin decidir; conteúdo que o admin já MANTEVE não é ocultado de novo
    IF NOT EXISTS (SELECT 1 FROM public.content_moderation WHERE target_type = p_type AND target_id = p_id) THEN
        SELECT count(DISTINCT r.reporter_id) INTO v_n FROM public.content_reports r JOIN public.profiles p ON p.id = r.reporter_id
         WHERE r.target_type = p_type AND r.target_id = p_id AND p.created_at < now() - interval '1 day';
        IF v_n >= 3 THEN
            INSERT INTO public.content_moderation (target_type, target_id, status, source, author_id) VALUES (p_type, p_id, 'hidden', 'reports', v_author);
            PERFORM public._moderation_apply(p_type, p_id, true);
            PERFORM public._notify(v_author, 'moderation_update', NULL, p_id,
                jsonb_build_object('title', 'Conteúdo ocultado', 'text', 'Seu ' || public._content_label(p_type) || ' foi ocultado após denúncias e será analisado pelo iUser.', 'path', '/painel-perfil'),
                'mod-h:' || p_type || ':' || p_id);
            RETURN 'hidden';
        END IF;
    END IF;
    RETURN 'reported';
END; $$;

-- o ADMIN decide (só o servidor): hide | clear (manter) | restore (voltar a mostrar, sem travar nova denúncia)
CREATE OR REPLACE FUNCTION public.admin_moderate(p_type text, p_id uuid, p_action text, p_note text, p_admin uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.content_moderation; v_author uuid; v_note text := NULLIF(left(btrim(COALESCE(p_note, '')), 500), '');
BEGIN
    IF p_action NOT IN ('hide', 'clear', 'restore') THEN RAISE EXCEPTION 'Ação inválida' USING ERRCODE = '22023'; END IF;
    v_author := COALESCE(public._content_author(p_type, p_id), (SELECT author_id FROM public.content_moderation WHERE target_type = p_type AND target_id = p_id));
    SELECT * INTO m FROM public.content_moderation WHERE target_type = p_type AND target_id = p_id FOR UPDATE;
    IF p_action = 'hide' THEN
        INSERT INTO public.content_moderation (target_type, target_id, status, source, author_id, note, decided_by, decided_at) VALUES (p_type, p_id, 'hidden', 'admin', v_author, v_note, p_admin, now())
        ON CONFLICT (target_type, target_id) DO UPDATE SET status = 'hidden', source = 'admin', note = EXCLUDED.note, decided_by = p_admin, decided_at = now();
        PERFORM public._moderation_apply(p_type, p_id, true);
        IF m.status IS DISTINCT FROM 'hidden' THEN
            PERFORM public._notify(v_author, 'moderation_update', NULL, p_id, jsonb_build_object('title', 'Conteúdo ocultado', 'text', 'O iUser ocultou seu ' || public._content_label(p_type) || ' por não seguir as regras.' || COALESCE(' Motivo: ' || v_note, ''), 'path', '/painel-perfil'), 'mod-a:' || p_type || ':' || p_id || ':' || floor(extract(epoch FROM now()))::text);
        END IF;
    ELSE
        -- clear = manter (e nunca mais ocultar por denúncias); restore = voltar a mostrar sem esse selo
        IF m.status = 'hidden' THEN
            PERFORM public._moderation_apply(p_type, p_id, false);
            PERFORM public._notify(v_author, 'moderation_update', NULL, p_id, jsonb_build_object('title', 'Conteúdo restaurado', 'text', 'O iUser analisou e restaurou seu ' || public._content_label(p_type) || '.', 'path', '/painel-perfil'), 'mod-r:' || p_type || ':' || p_id || ':' || floor(extract(epoch FROM now()))::text);
        END IF;
        IF p_action = 'clear' THEN
            INSERT INTO public.content_moderation (target_type, target_id, status, source, author_id, note, decided_by, decided_at) VALUES (p_type, p_id, 'cleared', 'admin', v_author, v_note, p_admin, now())
            ON CONFLICT (target_type, target_id) DO UPDATE SET status = 'cleared', source = 'admin', note = EXCLUDED.note, decided_by = p_admin, decided_at = now(), restore_active = false;
        ELSE
            DELETE FROM public.content_moderation WHERE target_type = p_type AND target_id = p_id;
        END IF;
    END IF;
    UPDATE public.content_reports SET reviewed_at = now() WHERE target_type = p_type AND target_id = p_id AND reviewed_at IS NULL;
END; $$;

-- ===== o que está oculto some das leituras =====
DROP POLICY IF EXISTS flashes_read ON public.flashes;
CREATE POLICY flashes_read ON public.flashes FOR SELECT USING (NOT public._is_hidden('flash', id));
DROP POLICY IF EXISTS flash_comments_read ON public.flash_comments;
CREATE POLICY flash_comments_read ON public.flash_comments FOR SELECT USING (NOT public._is_hidden('flash_comment', id));
DROP POLICY IF EXISTS "Public reviews are viewable by everyone" ON public.product_reviews;
CREATE POLICY "Public reviews are viewable by everyone" ON public.product_reviews FOR SELECT USING (NOT public._is_hidden('product_review', id));
DROP POLICY IF EXISTS comments_select_policy ON public.comments;
CREATE POLICY comments_select_policy ON public.comments FOR SELECT USING (NOT public._is_hidden('comment', id));
DROP POLICY IF EXISTS "Ler mensagens (senha exige ser membro)" ON public.community_messages;
CREATE POLICY "Ler mensagens (senha exige ser membro)" ON public.community_messages FOR SELECT USING (
    NOT public._is_hidden('community_message', id)
    AND ((NOT (EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_messages.community_id AND c.requires_password))) OR public._community_is_member(community_id, auth.uid())));

-- o feed (SECURITY DEFINER, não passa pelas políticas) também esconde o flash oculto
CREATE OR REPLACE FUNCTION public.get_flash_feed(p_mode text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_kind text DEFAULT NULL::text)
 RETURNS TABLE(kind text, id uuid, created_at timestamp with time zone, author_id uuid, author_name text, author_slug text, author_avatar text, title text, content text, media_url text, media_type text, like_count integer, comment_count integer, share_count integer, liked boolean, following boolean, link text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    -- DEFINER: confere is_active/is_blocked do autor (colunas privadas de profiles) mas só DEVOLVE o que é público (nome, @, foto)
    WITH items AS (
        SELECT 'flash'::text AS kind, f.id, f.created_at, f.author_id, NULL::text AS title, f.content, f.media_url, f.media_type,
               f.like_count, f.comment_count, f.share_count,
               EXISTS (SELECT 1 FROM public.flash_likes l WHERE l.flash_id = f.id AND l.profile_id = (SELECT auth.uid())) AS liked,
               NULL::text AS link
          FROM public.flashes f
         WHERE NOT public._is_hidden('flash', f.id)
        UNION ALL
        SELECT 'publication', pr.id, pr.created_at, pr.owner_id, pr.name, pr.description, pr.image_url,
               CASE WHEN pr.image_url IS NOT NULL THEN 'image' END,
               (SELECT count(*)::int FROM public.likes l WHERE l.publication_id = pr.id),
               (SELECT count(*)::int FROM public.comments c WHERE c.publication_id = pr.id), 0,
               EXISTS (SELECT 1 FROM public.likes l WHERE l.publication_id = pr.id AND l.profile_id = (SELECT auth.uid())),
               pr.slug
          FROM public.products pr
         WHERE pr.listing_type = 'publication' AND pr.is_active AND pr.store_id IS NULL
    )
    SELECT i.kind, i.id, i.created_at, i.author_id, p.name, p."profileSlug", p.avatar_url, i.title, i.content, i.media_url, i.media_type,
           i.like_count, i.comment_count, i.share_count, i.liked,
           EXISTS (SELECT 1 FROM public.follows fo WHERE fo.follower_id = (SELECT auth.uid()) AND fo.following_id = i.author_id) AS following,
           i.link
      FROM items i
      JOIN public.profiles p ON p.id = i.author_id
     WHERE COALESCE(p.is_active, true) AND NOT COALESCE(p.is_blocked, false)
       AND (p_before IS NULL OR i.created_at < p_before)
       AND (p_kind IS NULL OR i.kind = p_kind)   -- 'flash' | 'publication' | todos
       AND (p_mode <> 'following'
            OR i.author_id = (SELECT auth.uid())
            OR EXISTS (SELECT 1 FROM public.follows fo WHERE fo.follower_id = (SELECT auth.uid()) AND fo.following_id = i.author_id))
     ORDER BY i.created_at DESC
     LIMIT LEAST(GREATEST(p_limit, 1), 50);
$function$;

REVOKE ALL ON FUNCTION public.report_content(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_content(text, uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_moderate(text, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate(text, uuid, text, text, uuid) TO service_role;
