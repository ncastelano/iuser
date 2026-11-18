-- 20261130000081_report_stores_profiles_products.sql
--
-- DENUNCIAR LOJAS, PERFIS E PRODUTOS (18/11/2026, revisão antes de comercializar). Antes só se denunciava CONTEÚDO (flash, comentário,
-- publicação, avaliação, mensagem, produto digital): uma loja falsa de golpista ou um produto proibido não tinham como ser denunciados.
--   - 'product' = produto ou serviço (não publicação, não digital). Mesma regra do conteúdo: 3 pessoas diferentes ocultam até o admin decidir.
--   - 'store' e 'profile' NUNCA são ocultados sozinhos (3 contas de um concorrente derrubariam a loja de outro): só o admin, em Admin → Denúncias.
--     Ocultar loja = stores.is_active false. Ocultar perfil = conta bloqueada (profiles.is_blocked), como o bloqueio do admin.
--   - O DONO não reativa sozinho o que o iUser ocultou (antes dava: a publicação/produto digital ocultado voltava pelo interruptor "no ar").
-- Rollback: supabase/rollbacks/report_stores_profiles_products_rollback.sql. Cenários: supabase/tests/report_targets_scenarios.sql.

ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_target_type_check CHECK (target_type = ANY (ARRAY[
    'flash', 'flash_comment', 'publication', 'comment', 'product_review', 'community_message', 'digital_product', 'product', 'store', 'profile']));

CREATE OR REPLACE FUNCTION public._content_author(p_type text, p_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE p_type
        WHEN 'flash' THEN (SELECT author_id FROM public.flashes WHERE id = p_id)
        WHEN 'flash_comment' THEN (SELECT author_id FROM public.flash_comments WHERE id = p_id)
        WHEN 'publication' THEN (SELECT owner_id FROM public.products WHERE id = p_id AND listing_type = 'publication')
        WHEN 'comment' THEN (SELECT profile_id FROM public.comments WHERE id = p_id)
        WHEN 'product_review' THEN (SELECT profile_id FROM public.product_reviews WHERE id = p_id)
        WHEN 'community_message' THEN (SELECT profile_id FROM public.community_messages WHERE id = p_id)
        WHEN 'digital_product' THEN (SELECT owner_id FROM public.products WHERE id = p_id AND type = 'digital')
        WHEN 'product' THEN (SELECT COALESCE(s.owner_id, p.owner_id) FROM public.products p LEFT JOIN public.stores s ON s.id = p.store_id
                             WHERE p.id = p_id AND COALESCE(p.listing_type, '') <> 'publication' AND COALESCE(p.type, '') <> 'digital')
        WHEN 'store' THEN (SELECT owner_id FROM public.stores WHERE id = p_id)
        WHEN 'profile' THEN (SELECT id FROM public.profiles WHERE id = p_id)
    END
$$;
REVOKE ALL ON FUNCTION public._content_author(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._content_label(p_type text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_type WHEN 'flash' THEN 'flash' WHEN 'flash_comment' THEN 'comentário do seu flash' WHEN 'publication' THEN 'publicação'
                       WHEN 'comment' THEN 'comentário' WHEN 'product_review' THEN 'avaliação' WHEN 'community_message' THEN 'mensagem da comunidade'
                       WHEN 'digital_product' THEN 'produto digital' WHEN 'product' THEN 'produto' WHEN 'store' THEN 'loja' WHEN 'profile' THEN 'perfil' ELSE 'conteúdo' END
$$;

CREATE OR REPLACE FUNCTION public._moderation_apply(p_type text, p_id uuid, p_hide boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
    IF p_type NOT IN ('publication', 'digital_product', 'product', 'store', 'profile') THEN RETURN; END IF;
    IF p_hide THEN
        IF p_type = 'store' THEN
            UPDATE public.stores SET is_active = false WHERE id = p_id AND is_active;
        ELSIF p_type = 'profile' THEN
            UPDATE public.profiles SET is_blocked = true, blocked_reason = 'Moderação do iUser (denúncias)' WHERE id = p_id AND NOT COALESCE(is_blocked, false);
        ELSE
            UPDATE public.products SET is_active = false WHERE id = p_id AND is_active;
        END IF;
        GET DIAGNOSTICS n = ROW_COUNT;
        UPDATE public.content_moderation SET restore_active = (n > 0) WHERE target_type = p_type AND target_id = p_id;
    ELSE
        -- só desfaz o que a própria moderação fez (restore_active); a marca abaixo deixa a trava de reativação (guard_reactivate_hidden) passar
        PERFORM set_config('iuser.moderation_restore', '1', true);
        IF EXISTS (SELECT 1 FROM public.content_moderation WHERE target_type = p_type AND target_id = p_id AND restore_active) THEN
            IF p_type = 'store' THEN UPDATE public.stores SET is_active = true WHERE id = p_id;
            ELSIF p_type = 'profile' THEN UPDATE public.profiles SET is_blocked = false, blocked_reason = NULL WHERE id = p_id;
            ELSE UPDATE public.products SET is_active = true WHERE id = p_id; END IF;
        END IF;
        UPDATE public.content_moderation SET restore_active = false WHERE target_type = p_type AND target_id = p_id;
        PERFORM set_config('iuser.moderation_restore', '', true);
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public._moderation_apply(text, uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.report_content(p_type text, p_id uuid, p_reason text, p_note text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_author uuid; n integer; v_n integer;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Entre para denunciar' USING ERRCODE = '42501'; END IF;
    IF p_type NOT IN ('flash', 'flash_comment', 'publication', 'comment', 'product_review', 'community_message', 'digital_product', 'product', 'store', 'profile') THEN
        RAISE EXCEPTION 'Tipo inválido' USING ERRCODE = '22023';
    END IF;
    IF p_reason NOT IN ('spam', 'offensive', 'sexual', 'violence', 'scam', 'illegal', 'copyright', 'other') THEN RAISE EXCEPTION 'Motivo inválido' USING ERRCODE = '22023'; END IF;
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
    -- loja e perfil: só o admin decide (nunca some sozinho)
    IF p_type IN ('store', 'profile') THEN RETURN 'reported'; END IF;
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

-- O DONO não reativa o que o iUser ocultou (o interruptor "no ar"/"Pausar a loja" gravava is_active direto)
CREATE OR REPLACE FUNCTION public.guard_reactivate_hidden() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.is_active AND NOT COALESCE(OLD.is_active, false) AND COALESCE(auth.role(), '') IN ('authenticated', 'anon')
       AND COALESCE(current_setting('iuser.moderation_restore', true), '') <> '1' THEN
        IF (TG_TABLE_NAME = 'stores' AND public._is_hidden('store', NEW.id))
           OR (TG_TABLE_NAME = 'products' AND (public._is_hidden('product', NEW.id) OR public._is_hidden('publication', NEW.id) OR public._is_hidden('digital_product', NEW.id))) THEN
            RAISE EXCEPTION 'O iUser ocultou isto após denúncias. Fale com o suporte para revisar.' USING ERRCODE = '42501', HINT = 'moderation_hidden';
        END IF;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS stores_guard_reactivate_hidden ON public.stores;
CREATE TRIGGER stores_guard_reactivate_hidden BEFORE UPDATE OF is_active ON public.stores FOR EACH ROW EXECUTE FUNCTION public.guard_reactivate_hidden();
DROP TRIGGER IF EXISTS products_guard_reactivate_hidden ON public.products;
CREATE TRIGGER products_guard_reactivate_hidden BEFORE UPDATE OF is_active ON public.products FOR EACH ROW EXECUTE FUNCTION public.guard_reactivate_hidden();
