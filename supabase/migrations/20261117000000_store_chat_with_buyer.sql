-- O dono da loja abre (ou retoma) a conversa com quem comprou na loja dele.
-- Só vale para quem tem pedido nessa loja: não dá para puxar conversa com qualquer pessoa.
-- Devolve o id da conversa e o slug da loja (a tela /conversas abre na "sala" da loja).
CREATE OR REPLACE FUNCTION public.start_store_conversation_with_buyer(p_store uuid, p_buyer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_id uuid; v_slug text;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra conversar'; END IF;
    SELECT "storeSlug" INTO v_slug FROM public.stores WHERE id = p_store AND owner_id = v_user;
    IF v_slug IS NULL THEN RAISE EXCEPTION 'Essa loja não é sua'; END IF;
    IF p_buyer IS NULL OR p_buyer = v_user THEN RAISE EXCEPTION 'Cliente inválido'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.store_id = p_store AND o.buyer_id = p_buyer) THEN
        RAISE EXCEPTION 'Essa pessoa não tem pedido na sua loja';
    END IF;
    SELECT id INTO v_id FROM public.conversations WHERE customer_id = p_buyer AND store_id = p_store;
    IF v_id IS NULL THEN
        INSERT INTO public.conversations (customer_id, store_id, owner_read_at) VALUES (p_buyer, p_store, now())
        ON CONFLICT DO NOTHING;
        SELECT id INTO v_id FROM public.conversations WHERE customer_id = p_buyer AND store_id = p_store;
    END IF;
    RETURN jsonb_build_object('id', v_id, 'store_slug', v_slug);
END; $$;
REVOKE ALL ON FUNCTION public.start_store_conversation_with_buyer(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_store_conversation_with_buyer(uuid, uuid) TO authenticated;
