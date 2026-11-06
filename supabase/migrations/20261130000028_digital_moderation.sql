-- DENUNCIAR E DERRUBAR PRODUTO DIGITAL (música, curso, e-book, programa): a moderação da 13 passa a cobrir `digital_product` e ganha o motivo "Direito autoral" (`copyright`).
--   · 3 pessoas diferentes ocultam sozinho (a mesma regra) e o admin decide em Admin → Denúncias (ocultar / manter / restaurar), como nos outros conteúdos;
--   · ocultar um produto digital = `is_active=false` (some da loja, da vitrine e da busca, não vende mais) E o banco PARA DE ENTREGAR OS ARQUIVOS a quem não é o dono
--     (`get_digital_item_access` devolve `reason:'hidden'`): tirar do ar é parar de distribuir, inclusive para quem já tinha pego/comprado. Restaurar volta tudo.
--   · o autor é avisado (moderation_update) como nos outros tipos.
-- Rollback: supabase/rollbacks/digital_moderation_rollback.sql

ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_target_type_check CHECK (target_type IN ('flash', 'flash_comment', 'publication', 'comment', 'product_review', 'community_message', 'digital_product'));
ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_reason_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_reason_check CHECK (reason IN ('spam', 'offensive', 'sexual', 'violence', 'scam', 'illegal', 'copyright', 'other'));

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
    END
$$;
REVOKE ALL ON FUNCTION public._content_author(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._content_label(p_type text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_type WHEN 'flash' THEN 'flash' WHEN 'flash_comment' THEN 'comentário do seu flash' WHEN 'publication' THEN 'publicação'
                       WHEN 'comment' THEN 'comentário' WHEN 'product_review' THEN 'avaliação' WHEN 'community_message' THEN 'mensagem da comunidade' WHEN 'digital_product' THEN 'produto digital' ELSE 'conteúdo' END
$$;

CREATE OR REPLACE FUNCTION public._moderation_apply(p_type text, p_id uuid, p_hide boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
    IF p_type NOT IN ('publication', 'digital_product') THEN RETURN; END IF;
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

CREATE OR REPLACE FUNCTION public.report_content(p_type text, p_id uuid, p_reason text, p_note text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_author uuid; n integer; v_n integer;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Entre para denunciar' USING ERRCODE = '42501'; END IF;
    IF p_type NOT IN ('flash', 'flash_comment', 'publication', 'comment', 'product_review', 'community_message', 'digital_product') THEN RAISE EXCEPTION 'Tipo inválido' USING ERRCODE = '22023'; END IF;
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

-- produto digital oculto: ninguém além do dono abre os arquivos (nem a prévia)
CREATE OR REPLACE FUNCTION public.get_digital_item_access(p_item uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.digital_contents;
BEGIN
    SELECT * INTO c FROM public.digital_contents WHERE id = p_item;
    IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false); END IF;
    IF public._is_hidden('digital_product', c.product_id) AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = c.product_id AND p.owner_id = auth.uid()) THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'hidden');
    END IF;
    IF NOT (c.is_preview OR c.is_teaser OR public._digital_access(c.product_id, auth.uid())) THEN RETURN jsonb_build_object('allowed', false); END IF;
    RETURN jsonb_build_object('allowed', true, 'kind', c.kind, 'title', c.title, 'storage_path', c.storage_path, 'external_url', c.external_url, 'mime_type', c.mime_type);
END $$;
