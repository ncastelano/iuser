-- Cenários dos avisos de pedido digital (migration 20261130000041). Roda numa transação desfeita; só LOCAL/staging.
--   rodar:  docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/digital_order_notices_scenarios.sql
BEGIN;
DO $$
DECLARE
    st public.stores; owner uuid; buyer uuid; dig uuid; phys uuid; o1 uuid := gen_random_uuid(); o2 uuid := gen_random_uuid(); o3 uuid := gen_random_uuid(); n int; t text; pth text;
BEGIN
    SELECT s.* INTO st FROM public.stores s WHERE s.is_active AND EXISTS (SELECT 1 FROM public.products p WHERE p.store_id = s.id AND p.type = 'digital' AND p.is_active) AND EXISTS (SELECT 1 FROM public.products p WHERE p.store_id = s.id AND p.type <> 'digital' AND p.is_active) LIMIT 1;
    owner := st.owner_id;
    SELECT id INTO buyer FROM public.profiles WHERE id <> owner AND is_active LIMIT 1;
    SELECT id INTO dig FROM public.products WHERE store_id = st.id AND type = 'digital' AND is_active ORDER BY created_at LIMIT 1;
    SELECT id INTO phys FROM public.products WHERE store_id = st.id AND type <> 'digital' AND is_active LIMIT 1;

    -- 1) pedido SÓ digital: a loja recebe "Pedido digital novo" (e NÃO o "Pedido novo" comum)
    INSERT INTO public.orders (id, store_id, buyer_id, checkout_id, status, total_amount) VALUES (o1, st.id, buyer, gen_random_uuid(), 'pending', 0);
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price) VALUES (o1, dig, 'x', 1, 49.9, 49.9);
    UPDATE public.orders SET total_amount = 49.9 WHERE id = o1;
    SELECT count(*) INTO n FROM public.profile_notifications WHERE profile_id = owner AND ref_id = o1 AND kind = 'digital_order_new';
    IF n <> 1 THEN RAISE EXCEPTION '1: a loja deveria receber 1 aviso de pedido digital (veio %)', n; END IF;
    SELECT count(*) INTO n FROM public.profile_notifications WHERE profile_id = owner AND ref_id = o1 AND kind = 'order_new';
    IF n <> 0 THEN RAISE EXCEPTION '1: não pode haver também o "Pedido novo" comum'; END IF;
    SELECT meta->>'text', meta->>'path' INTO t, pth FROM public.profile_notifications WHERE profile_id = owner AND ref_id = o1 AND kind = 'digital_order_new';
    IF t NOT LIKE '%libere o acesso%' OR t NOT LIKE '%R$ 49,90%' OR pth <> '/painel-loja/' || st."storeSlug" || '/pedidos' THEN RAISE EXCEPTION '1: texto ou destino errado: % | %', t, pth; END IF;
    RAISE NOTICE 'OK 1';

    -- 2) a loja libera (paid): o cliente recebe "Acesso liberado" apontando para a sala do produto (e NÃO "Pedido entregue")
    UPDATE public.orders SET status = 'paid' WHERE id = o1;
    SELECT meta->>'path' INTO pth FROM public.profile_notifications WHERE profile_id = buyer AND ref_id = o1 AND kind = 'digital_access_released';
    IF pth IS DISTINCT FROM '/minhas-compras-digitais/' || dig THEN RAISE EXCEPTION '2: destino do acesso liberado errado: %', pth; END IF;
    SELECT count(*) INTO n FROM public.profile_notifications WHERE profile_id = buyer AND ref_id = o1 AND kind = 'order_delivered';
    IF n <> 0 THEN RAISE EXCEPTION '2: não pode haver "Pedido entregue" no pedido digital'; END IF;
    RAISE NOTICE 'OK 2';

    -- 3) carrinho MISTO (digital + físico): os avisos comuns de sempre
    INSERT INTO public.orders (id, store_id, buyer_id, checkout_id, status, total_amount) VALUES (o2, st.id, buyer, gen_random_uuid(), 'pending', 0);
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price) VALUES (o2, dig, 'x', 1, 10, 10), (o2, phys, 'y', 1, 20, 20);
    UPDATE public.orders SET total_amount = 30 WHERE id = o2;
    SELECT count(*) INTO n FROM public.profile_notifications WHERE profile_id = owner AND ref_id = o2 AND kind = 'order_new';
    IF n <> 1 THEN RAISE EXCEPTION '3: pedido misto deveria dar o aviso comum'; END IF;
    SELECT count(*) INTO n FROM public.profile_notifications WHERE profile_id = owner AND ref_id = o2 AND kind = 'digital_order_new';
    IF n <> 0 THEN RAISE EXCEPTION '3: pedido misto não é digital'; END IF;
    RAISE NOTICE 'OK 3';

    -- 4) pedido só FÍSICO: sem mudança
    INSERT INTO public.orders (id, store_id, buyer_id, checkout_id, status, total_amount) VALUES (o3, st.id, buyer, gen_random_uuid(), 'pending', 0);
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price) VALUES (o3, phys, 'y', 1, 20, 20);
    UPDATE public.orders SET total_amount = 20 WHERE id = o3;
    UPDATE public.orders SET status = 'paid' WHERE id = o3;
    SELECT count(*) INTO n FROM public.profile_notifications WHERE ref_id = o3 AND kind IN ('order_new', 'order_delivered');
    IF n <> 2 THEN RAISE EXCEPTION '4: pedido físico deveria dar Pedido novo + Pedido entregue (veio %)', n; END IF;
    RAISE NOTICE 'OK 4';
END $$;
ROLLBACK;
