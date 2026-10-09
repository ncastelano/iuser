-- Conversa a partir de um serviço: quem clica em "iUser" na página do serviço já manda, no chat de quem oferece,
-- uma mensagem com a postagem do serviço — assim a pessoa sabe por que está sendo chamada.

ALTER TABLE public.direct_messages
    ADD COLUMN IF NOT EXISTS ref_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

-- Abre (ou retoma) a conversa com quem oferece o serviço e posta a mensagem com a postagem.
-- Não repete a mesma postagem se a pessoa já mandou nas últimas 12 horas (clicar de novo só abre a conversa).
CREATE OR REPLACE FUNCTION public.start_conversation_about_product(p_product uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user uuid := auth.uid();
    p public.products;
    v_conv uuid;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra conversar'; END IF;
    SELECT * INTO p FROM public.products WHERE id = p_product;
    IF NOT FOUND THEN RAISE EXCEPTION 'Postagem não encontrada'; END IF;

    IF p.store_id IS NOT NULL THEN
        v_conv := public.start_conversation(NULL, p.store_id);
    ELSIF p.owner_id IS NOT NULL THEN
        v_conv := public.start_conversation(p.owner_id, NULL);
    ELSE
        RAISE EXCEPTION 'Essa postagem não tem dono';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.direct_messages
        WHERE conversation_id = v_conv AND sender_id = v_user AND ref_product_id = p_product
          AND created_at > now() - interval '12 hours'
    ) THEN
        INSERT INTO public.direct_messages (conversation_id, sender_id, content, ref_product_id)
        VALUES (v_conv, v_user, 'Olá! Vi o seu serviço "' || left(p.name, 120) || '" no iUser e quero saber mais.', p_product);
    END IF;
    RETURN v_conv;
END; $$;
REVOKE ALL ON FUNCTION public.start_conversation_about_product(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_conversation_about_product(uuid) TO authenticated;

-- As postagens citadas nas mensagens de uma conversa (só pra quem participa dela)
CREATE OR REPLACE FUNCTION public.get_conversation_refs(p_conv uuid)
RETURNS TABLE (id uuid, name text, slug text, image_url text, owner_slug text, listing_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.name, p.slug, p.image_url,
           COALESCE(s."storeSlug", pr."profileSlug"), p.listing_type
    FROM public.products p
    LEFT JOIN public.stores s ON s.id = p.store_id
    LEFT JOIN public.profiles pr ON pr.id = p.owner_id
    WHERE public._can_access_conversation(p_conv, auth.uid())
      AND p.id IN (SELECT m.ref_product_id FROM public.direct_messages m WHERE m.conversation_id = p_conv AND m.ref_product_id IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.get_conversation_refs(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_refs(uuid) TO authenticated;
