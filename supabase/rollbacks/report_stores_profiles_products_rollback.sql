-- Rollback de 20261130000081: volta a denúncia só de conteúdo (as denúncias de loja/perfil/produto são apagadas) e tira a trava de reativação.
DROP TRIGGER IF EXISTS stores_guard_reactivate_hidden ON public.stores;
DROP TRIGGER IF EXISTS products_guard_reactivate_hidden ON public.products;
DROP FUNCTION IF EXISTS public.guard_reactivate_hidden();
DELETE FROM public.content_reports WHERE target_type IN ('product','store','profile');
DELETE FROM public.content_moderation WHERE target_type IN ('product','store','profile');
ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_target_type_check CHECK (target_type = ANY (ARRAY['flash','flash_comment','publication','comment','product_review','community_message','digital_product']));
CREATE OR REPLACE FUNCTION public._content_author(p_type text, p_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT CASE p_type
        WHEN 'flash' THEN (SELECT author_id FROM public.flashes WHERE id = p_id)
        WHEN 'flash_comment' THEN (SELECT author_id FROM public.flash_comments WHERE id = p_id)
        WHEN 'publication' THEN (SELECT owner_id FROM public.products WHERE id = p_id AND listing_type = 'publication')
        WHEN 'comment' THEN (SELECT profile_id FROM public.comments WHERE id = p_id)
        WHEN 'product_review' THEN (SELECT profile_id FROM public.product_reviews WHERE id = p_id)
        WHEN 'community_message' THEN (SELECT profile_id FROM public.community_messages WHERE id = p_id)
        WHEN 'digital_product' THEN (SELECT owner_id FROM public.products WHERE id = p_id AND type = 'digital')
    END
$function$

;
CREATE OR REPLACE FUNCTION public._content_label(p_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT CASE p_type WHEN 'flash' THEN 'flash' WHEN 'flash_comment' THEN 'comentário do seu flash' WHEN 'publication' THEN 'publicação'
                       WHEN 'comment' THEN 'comentário' WHEN 'product_review' THEN 'avaliação' WHEN 'community_message' THEN 'mensagem da comunidade' WHEN 'digital_product' THEN 'produto digital' ELSE 'conteúdo' END
$function$

;
CREATE OR REPLACE FUNCTION public._moderation_apply(p_type text, p_id uuid, p_hide boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$

;
CREATE OR REPLACE FUNCTION public.report_content(p_type text, p_id uuid, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$

;
