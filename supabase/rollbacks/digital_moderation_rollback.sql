-- Desfaz 20261130000028_digital_moderation.sql (denunciar produto digital)
-- 1) tira do ar o que estava oculto como produto digital e apaga as denúncias/decisões desse tipo
UPDATE public.products SET is_active = true WHERE id IN (SELECT target_id FROM public.content_moderation WHERE target_type = 'digital_product' AND restore_active);
DELETE FROM public.content_moderation WHERE target_type = 'digital_product';
DELETE FROM public.content_reports WHERE target_type = 'digital_product' OR reason = 'copyright';
ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_target_type_check CHECK (target_type IN ('flash', 'flash_comment', 'publication', 'comment', 'product_review', 'community_message'));
ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_reason_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_reason_check CHECK (reason IN ('spam', 'offensive', 'sexual', 'violence', 'scam', 'illegal', 'other'));
-- 2) o acesso aos arquivos volta ao da 20261130000016 (sem a checagem de produto oculto)
CREATE OR REPLACE FUNCTION public.get_digital_item_access(p_item uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.digital_contents;
BEGIN
    SELECT * INTO c FROM public.digital_contents WHERE id = p_item;
    IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false); END IF;
    IF NOT (c.is_preview OR c.is_teaser OR public._digital_access(c.product_id, auth.uid())) THEN RETURN jsonb_build_object('allowed', false); END IF;
    RETURN jsonb_build_object('allowed', true, 'kind', c.kind, 'title', c.title, 'storage_path', c.storage_path, 'external_url', c.external_url, 'mime_type', c.mime_type);
END $$;
-- 3) as funções _content_author, _content_label, _moderation_apply e report_content voltam às da 20261130000013 (reaplique-as daquele arquivo)
