-- O que já aconteceu antes das notificações existirem entra na lista (já como lido, pra não aparecer tudo como "novo").
DO $$
DECLARE r record; p public.products; v_owner uuid; v_slug text; v_kind text; c public.comments;
BEGIN
    FOR r IN SELECT follower_id, following_id, created_at FROM public.follows LOOP
        INSERT INTO public.profile_notifications (profile_id, kind, actor_id, meta, dedupe_key, created_at, read_at)
        SELECT r.following_id, 'follow', r.follower_id, '{}'::jsonb, 'follow:' || r.follower_id, r.created_at, now()
        WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = r.following_id) AND r.following_id <> r.follower_id
        ON CONFLICT DO NOTHING;
    END LOOP;

    FOR r IN SELECT l.profile_id, l.publication_id, l.created_at FROM public.likes l LOOP
        SELECT * INTO p FROM public.products WHERE id = r.publication_id;
        IF NOT FOUND THEN CONTINUE; END IF;
        IF p.store_id IS NOT NULL THEN SELECT s.owner_id, s."storeSlug" INTO v_owner, v_slug FROM public.stores s WHERE s.id = p.store_id;
        ELSE v_owner := p.owner_id; SELECT "profileSlug" INTO v_slug FROM public.profiles WHERE id = p.owner_id; END IF;
        v_kind := CASE WHEN p.listing_type = 'publication' THEN 'publication_like' WHEN p.listing_type = 'service_offer' OR p.type = 'service' THEN 'service_like' ELSE 'product_like' END;
        IF v_owner IS NULL OR v_owner = r.profile_id THEN CONTINUE; END IF;
        INSERT INTO public.profile_notifications (profile_id, kind, actor_id, ref_id, meta, dedupe_key, created_at, read_at)
        VALUES (v_owner, v_kind, r.profile_id, p.id, jsonb_build_object('title', p.name, 'slug', p.slug, 'owner_slug', v_slug), 'like:' || r.profile_id || ':' || p.id, r.created_at, now())
        ON CONFLICT DO NOTHING;
    END LOOP;

    FOR c IN SELECT * FROM public.comments LOOP
        p := NULL; v_owner := NULL; v_slug := NULL;
        IF c.publication_id IS NOT NULL THEN
            SELECT * INTO p FROM public.products WHERE id = c.publication_id;
            IF FOUND THEN
                IF p.store_id IS NOT NULL THEN SELECT s.owner_id, s."storeSlug" INTO v_owner, v_slug FROM public.stores s WHERE s.id = p.store_id;
                ELSE v_owner := p.owner_id; SELECT "profileSlug" INTO v_slug FROM public.profiles WHERE id = p.owner_id; END IF;
            END IF;
        END IF;
        IF c.parent_comment_id IS NOT NULL THEN
            SELECT profile_id INTO v_owner FROM public.comments WHERE id = c.parent_comment_id;
            v_kind := 'comment_reply';
        ELSIF c.publication_id IS NOT NULL THEN v_kind := 'publication_comment';
        ELSIF c.profile_target_id IS NOT NULL THEN v_owner := c.profile_target_id; v_kind := 'profile_comment';
        ELSE CONTINUE; END IF;
        IF v_owner IS NULL OR v_owner = c.profile_id THEN CONTINUE; END IF;
        INSERT INTO public.profile_notifications (profile_id, kind, actor_id, ref_id, meta, dedupe_key, created_at, read_at)
        VALUES (v_owner, v_kind, c.profile_id, c.id,
                jsonb_build_object('snippet', left(c.content, 140), 'title', p.name, 'slug', p.slug, 'owner_slug', v_slug),
                CASE WHEN v_kind = 'comment_reply' THEN 'reply:' ELSE 'comment:' END || c.id, c.created_at, now())
        ON CONFLICT DO NOTHING;
    END LOOP;

    INSERT INTO public.profile_notifications (profile_id, kind, actor_id, meta, dedupe_key, created_at, read_at)
    SELECT pr.upline_id, 'invite_signup', pr.id, '{}'::jsonb, 'invite:' || pr.id, COALESCE(pr.created_at, now()), now()
    FROM public.profiles pr WHERE pr.upline_id IS NOT NULL AND pr.upline_id <> pr.id
    ON CONFLICT DO NOTHING;
END $$;
