-- RESUMO DO DIGITAL NO PAINEL DA LOJA: o que a loja tem de curso, música e programa e como está indo — produtos, vendas, o que espera "Liberar acesso", quem pegou de graça, downloads e o
-- Clube (assinantes e pagamentos a conferir). Só LEITURA e só do dono da loja; sem dado pessoal de cliente (só números). Nada novo é gravado.
CREATE OR REPLACE FUNCTION public.get_store_digital_summary(p_store uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    s public.stores;
    v_products int; v_free int; v_items int; v_paid int; v_cents bigint; v_release int; v_claims int; v_downloads bigint;
    v_price numeric; v_music boolean; v_members int; v_check int;
BEGIN
    SELECT * INTO s FROM public.stores WHERE id = p_store AND owner_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Só o dono da loja vê o resumo do digital' USING ERRCODE = '42501'; END IF;

    SELECT count(*), count(*) FILTER (WHERE price = 0) INTO v_products, v_free
      FROM public.products WHERE store_id = p_store AND type = 'digital' AND is_active;

    SELECT count(*) INTO v_items FROM public.digital_contents c JOIN public.products p ON p.id = c.product_id
     WHERE p.store_id = p_store AND p.type = 'digital' AND p.is_active AND NOT COALESCE(c.is_teaser, false);

    -- vendas: pedidos PAGOS com algum item digital desta loja, e quanto os itens digitais somaram
    SELECT count(DISTINCT o.id), COALESCE(sum(round(oi.total_price * 100)), 0)::bigint INTO v_paid, v_cents
      FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id JOIN public.products p ON p.id = oi.product_id
     WHERE o.store_id = p_store AND o.status = 'paid' AND p.type = 'digital';

    -- esperando "Liberar acesso": pedidos pendentes SÓ de produtos digitais (os mistos seguem o fluxo físico)
    SELECT count(*) INTO v_release FROM public.orders o
     WHERE o.store_id = p_store AND o.status = 'pending'
       AND EXISTS (SELECT 1 FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id WHERE oi.order_id = o.id AND p.type = 'digital')
       AND NOT EXISTS (SELECT 1 FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id WHERE oi.order_id = o.id AND p.type <> 'digital');

    SELECT count(*) INTO v_claims FROM public.digital_claims dc JOIN public.products p ON p.id = dc.product_id WHERE p.store_id = p_store AND p.type = 'digital';
    SELECT COALESCE(sum(c.download_count), 0) INTO v_downloads FROM public.digital_contents c JOIN public.products p ON p.id = c.product_id WHERE p.store_id = p_store AND c.kind = 'app';

    SELECT s.vip_club_price, COALESCE((SELECT includes_music FROM public.store_club_settings WHERE store_id = p_store), false) INTO v_price, v_music;
    SELECT count(*) INTO v_members FROM public.store_vip_members WHERE store_id = p_store AND status = 'active' AND source IN ('pix', 'asaas') AND current_period_end > now();
    SELECT count(*) INTO v_check FROM public.store_club_payments WHERE store_id = p_store AND status = 'reported';

    RETURN jsonb_build_object(
        'products', v_products, 'free_products', v_free, 'items', v_items,
        'paid_orders', v_paid, 'revenue_cents', v_cents, 'to_release', v_release,
        'free_claims', v_claims, 'downloads', v_downloads,
        'club_price_cents', CASE WHEN v_price IS NULL THEN NULL ELSE round(v_price * 100)::int END, 'club_includes_music', v_music,
        'club_paying_members', v_members, 'club_to_check', v_check
    );
END; $$;
REVOKE ALL ON FUNCTION public.get_store_digital_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_digital_summary(uuid) TO authenticated, service_role;
