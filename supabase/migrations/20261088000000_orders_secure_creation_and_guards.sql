-- Etapa 1.5 / Grupo C — pedidos: criação segura, UPDATE/DELETE protegidos e integridade com a entrega.
--
-- Problemas: (1) qualquer pessoa inseria em orders/order_items (policy `true`), escolhendo total_amount, delivery_fee,
-- status e preços; o frete adulterado virava o valor oferecido ao motorista; (2) o dono da loja alterava QUALQUER coluna
-- do pedido; (3) o comprador apagava o próprio pedido mesmo com entrega em andamento.
--
-- Correção:
--  * create_store_order / create_in_person_sale (SECURITY DEFINER): preços de produto e adicionais, desconto do Club VIP,
--    frete e total saem do BANCO; o status inicial é sempre 'pending' (venda presencial: 'paid', só pelo dono da loja).
--    O cliente só manda o que escolheu (produtos, quantidades, endereço, forma de pagamento);
--  * sem policy de INSERT em orders/order_items para clientes;
--  * gatilho de guarda no UPDATE: a loja só muda o status, por transições permitidas; valores e vínculos são imutáveis;
--  * DELETE: só pedido ainda 'pending', do próprio comprador e sem entrega/corrida ligada;
--  * integridade pedido ↔ corrida (loja do pedido = loja da corrida).
-- Não mexe em monetização (R$ 0,50 / plano) nem no Asaas: os gatilhos de cobrança de orders continuam os mesmos e disparam
-- no mesmo evento (status → 'paid').

-- ============================================================
-- 1. Frete: fonte única no servidor (mesma regra que o app usava no navegador)
-- ============================================================
CREATE OR REPLACE FUNCTION public._compute_store_delivery_fee(p_store uuid, p_lat double precision, p_lng double precision)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    s public.stores;
    v_dist numeric;
BEGIN
    SELECT * INTO s FROM public.stores WHERE id = p_store;
    IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
    IF s.delivery_type = 'fixed' THEN
        RETURN COALESCE(s.delivery_fee, 0);
    ELSIF s.delivery_type = 'distance' THEN
        IF s.store_lat IS NULL OR s.store_lng IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN
            RAISE EXCEPTION 'Não foi possível calcular a distância.';
        END IF;
        v_dist := public.haversine_km(s.store_lat, s.store_lng, p_lat, p_lng);
        IF s.delivery_base_distance IS NOT NULL AND s.delivery_base_fee IS NOT NULL THEN
            IF v_dist <= s.delivery_base_distance THEN RETURN s.delivery_base_fee; END IF;
            RETURN s.delivery_base_fee + (v_dist - s.delivery_base_distance) * COALESCE(s.delivery_fee_per_km, 0);
        END IF;
        RETURN v_dist * COALESCE(s.delivery_fee_per_km, 0);
    END IF;
    RETURN 0;   -- 'free' ou sem tipo
END;
$$;
REVOKE ALL ON FUNCTION public._compute_store_delivery_fee(uuid, double precision, double precision) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 2. Itens do pedido com preço do banco (produto + adicionais ativos do próprio produto)
--    p_items: [{"product_id": uuid, "quantity": int, "comment": text, "addons": [{"id": uuid}]}]
--    Devolve linhas já valorizadas, para gravar em order_items e somar o subtotal.
-- ============================================================
CREATE OR REPLACE FUNCTION public._price_order_items(p_store uuid, p_items jsonb, p_allow_addons boolean)
RETURNS TABLE(product_id uuid, product_name text, quantity integer, unit_price numeric, total_price numeric, comment text, addons jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    it jsonb;
    pr public.products;
    ad jsonb;
    ar record;
    v_qty integer;
    v_addons jsonb;
    v_addon_sum numeric;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Seu carrinho está vazio';
    END IF;
    IF jsonb_array_length(p_items) > 100 THEN RAISE EXCEPTION 'Itens demais no pedido'; END IF;
    FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT * INTO pr FROM public.products WHERE id = NULLIF(it->>'product_id', '')::uuid AND store_id = p_store AND is_active;
        IF NOT FOUND THEN RAISE EXCEPTION 'Produto indisponível nesta loja'; END IF;
        v_qty := COALESCE(NULLIF(it->>'quantity', '')::integer, 0);
        IF v_qty < 1 OR v_qty > 1000 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;

        v_addons := '[]'::jsonb;
        v_addon_sum := 0;
        IF p_allow_addons AND jsonb_typeof(it->'addons') = 'array' THEN
            FOR ad IN SELECT * FROM jsonb_array_elements(it->'addons') LOOP
                SELECT pa.id, pa.name, pa.price INTO ar FROM public.product_addons pa
                 WHERE pa.id = NULLIF(ad->>'id', '')::uuid AND pa.product_id = pr.id AND pa.is_active;
                IF NOT FOUND THEN RAISE EXCEPTION 'Adicional indisponível'; END IF;
                v_addons := v_addons || jsonb_build_array(jsonb_build_object('id', ar.id, 'name', ar.name, 'price', ar.price));
                v_addon_sum := v_addon_sum + ar.price;
            END LOOP;
        END IF;

        product_id := pr.id;
        product_name := pr.name;
        quantity := v_qty;
        unit_price := pr.price + v_addon_sum;
        total_price := (pr.price + v_addon_sum) * v_qty;
        comment := left(NULLIF(btrim(COALESCE(it->>'comment', '')), ''), 500);
        addons := CASE WHEN jsonb_array_length(v_addons) > 0 THEN v_addons ELSE NULL END;
        RETURN NEXT;
    END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._price_order_items(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;

-- Desconto do Club VIP calculado e consumido no servidor (mesma regra do app: só itens elegíveis; nunca abate o frete).
CREATE OR REPLACE FUNCTION public._apply_campaign_discount(p_code text, p_store uuid, p_order uuid, p_via text, p_items jsonb)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    red public.store_campaign_redemptions;
    camp public.store_campaigns;
    v_eligible numeric;
    v_discount numeric;
    v_updated integer;
BEGIN
    SELECT * INTO red FROM public.store_campaign_redemptions WHERE code = upper(btrim(p_code)) FOR UPDATE;
    IF NOT FOUND OR red.status <> 'available' THEN RAISE EXCEPTION 'Código inválido ou já usado'; END IF;
    SELECT * INTO camp FROM public.store_campaigns WHERE id = red.campaign_id;
    IF NOT FOUND OR NOT camp.active OR (camp.ends_at IS NOT NULL AND camp.ends_at <= now()) THEN RAISE EXCEPTION 'Código inválido ou já usado'; END IF;
    IF camp.store_id <> p_store THEN RAISE EXCEPTION 'Esse código não é dessa loja'; END IF;

    SELECT COALESCE(sum((i->>'total_price')::numeric), 0) INTO v_eligible
      FROM jsonb_array_elements(p_items) i
     WHERE (i->>'product_id')::uuid = ANY (camp.product_ids);
    v_discount := CASE camp.discount_type
        WHEN 'full' THEN v_eligible
        WHEN 'percent' THEN v_eligible * (COALESCE(camp.discount_value, 0) / 100)
        ELSE LEAST(COALESCE(camp.discount_value, 0), v_eligible)
    END;

    UPDATE public.store_campaign_redemptions
       SET status = 'redeemed', redeemed_at = now(), redeemed_via = p_via, order_id = p_order
     WHERE id = red.id AND status = 'available';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Código inválido ou já usado'; END IF;
    RETURN round(v_discount, 2);
END;
$$;
REVOKE ALL ON FUNCTION public._apply_campaign_discount(text, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3. Pedido do cliente (carrinho): tudo calculado aqui; status inicial sempre 'pending'
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_store_order(
    p_store_id uuid,
    p_items jsonb,
    p_delivery_option text,
    p_payment_method text,
    p_address text DEFAULT NULL,
    p_lat double precision DEFAULT NULL,
    p_lng double precision DEFAULT NULL,
    p_cash_change_for numeric DEFAULT NULL,
    p_card_is_contactless boolean DEFAULT NULL,
    p_discount_code text DEFAULT NULL,
    p_checkout_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    s public.stores;
    pf record;
    v_priced jsonb;
    v_items_total numeric;
    v_fee numeric := 0;
    v_discount numeric := 0;
    v_total numeric;
    v_order uuid;
    v_checkout uuid := COALESCE(p_checkout_id, gen_random_uuid());
    v_option text;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para fazer o pedido' USING ERRCODE = '42501'; END IF;
    SELECT * INTO s FROM public.stores WHERE id = p_store_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
    IF p_payment_method NOT IN ('pix', 'cartao', 'dinheiro', 'combinar') THEN RAISE EXCEPTION 'Forma de pagamento inválida'; END IF;
    v_option := CASE WHEN p_delivery_option IN ('retirada', 'pickup') THEN 'retirada' WHEN p_delivery_option = 'entrega' THEN 'entrega' ELSE NULL END;
    IF v_option IS NULL THEN RAISE EXCEPTION 'Escolha como deseja receber o pedido'; END IF;

    SELECT COALESCE(NULLIF(btrim(name), ''), 'Cliente') AS name, COALESCE(NULLIF(btrim("profileSlug"), ''), v_uid::text) AS slug
      INTO pf FROM public.profiles WHERE id = v_uid;
    IF NOT FOUND THEN pf.name := 'Cliente'; pf.slug := v_uid::text; END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb), COALESCE(sum(x.total_price), 0)
      INTO v_priced, v_items_total
      FROM public._price_order_items(p_store_id, p_items, true) x;

    IF v_option = 'entrega' THEN
        IF NOT COALESCE(s.accepts_delivery, false) THEN RAISE EXCEPTION 'Esta loja não faz entrega'; END IF;
        IF p_address IS NULL OR btrim(p_address) = '' THEN RAISE EXCEPTION 'Informe o endereço de entrega'; END IF;
        v_fee := round(public._compute_store_delivery_fee(p_store_id, p_lat, p_lng), 2);
    ELSE
        IF NOT COALESCE(s.accepts_pickup, true) THEN RAISE EXCEPTION 'Esta loja não tem retirada no local'; END IF;
    END IF;

    INSERT INTO public.orders (
        store_id, buyer_id, buyer_name, buyer_profile_slug, total_amount, delivery_fee, delivery_option, payment_method,
        delivery_address, delivery_lat, delivery_lng, cash_change_for, card_is_contactless, status, checkout_id
    ) VALUES (
        p_store_id, v_uid, pf.name, pf.slug, 0, v_fee, v_option, p_payment_method,
        CASE WHEN v_option = 'entrega' THEN btrim(p_address) ELSE 'Retirada no local' END,
        CASE WHEN v_option = 'entrega' THEN p_lat::numeric END,
        CASE WHEN v_option = 'entrega' THEN p_lng::numeric END,
        CASE WHEN p_payment_method = 'dinheiro' AND p_cash_change_for IS NOT NULL AND p_cash_change_for >= 0 THEN p_cash_change_for END,
        CASE WHEN p_payment_method = 'cartao' THEN p_card_is_contactless END,
        'pending', v_checkout
    ) RETURNING id INTO v_order;

    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price, comment, addons)
    SELECT v_order, x.product_id, x.product_name, x.quantity, x.unit_price, x.total_price, x.comment, x.addons
      FROM public._price_order_items(p_store_id, p_items, true) x;

    IF p_discount_code IS NOT NULL AND btrim(p_discount_code) <> '' THEN
        v_discount := public._apply_campaign_discount(p_discount_code, p_store_id, v_order, 'cart', v_priced);
    END IF;

    v_total := GREATEST(0, v_items_total - v_discount + v_fee);
    UPDATE public.orders SET total_amount = v_total WHERE id = v_order;

    RETURN jsonb_build_object('order_id', v_order, 'checkout_id', v_checkout, 'items_total', v_items_total,
                              'discount', v_discount, 'delivery_fee', v_fee, 'total_amount', v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.create_store_order(uuid, jsonb, text, text, text, double precision, double precision, numeric, boolean, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_order(uuid, jsonb, text, text, text, double precision, double precision, numeric, boolean, text, uuid) TO authenticated;

-- ============================================================
-- 4. Venda presencial (só o dono da loja): sem comprador, status 'paid' como sempre, preço do banco
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_in_person_sale(
    p_store_id uuid,
    p_items jsonb,
    p_buyer_name text,
    p_payment_method text,
    p_discount_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    s public.stores;
    v_priced jsonb;
    v_items_total numeric;
    v_discount numeric := 0;
    v_total numeric;
    v_order uuid;
BEGIN
    SELECT * INTO s FROM public.stores WHERE id = p_store_id;
    IF NOT FOUND OR s.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF p_payment_method NOT IN ('dinheiro', 'pix', 'credito', 'debito') THEN RAISE EXCEPTION 'Forma de pagamento inválida'; END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb), COALESCE(sum(x.total_price), 0)
      INTO v_priced, v_items_total
      FROM public._price_order_items(p_store_id, p_items, false) x;

    INSERT INTO public.orders (
        checkout_id, store_id, buyer_name, buyer_profile_slug, total_amount, delivery_fee, delivery_option, payment_method,
        delivery_address, delivery_lat, delivery_lng, status
    ) VALUES (
        gen_random_uuid(), p_store_id, COALESCE(NULLIF(btrim(p_buyer_name), ''), 'Cliente presencial'), '', 0, 0, 'pickup', p_payment_method,
        '', NULL, NULL, 'paid'
    ) RETURNING id INTO v_order;

    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
    SELECT v_order, x.product_id, x.product_name, x.quantity, x.unit_price, x.total_price
      FROM public._price_order_items(p_store_id, p_items, false) x;

    IF p_discount_code IS NOT NULL AND btrim(p_discount_code) <> '' THEN
        v_discount := public._apply_campaign_discount(p_discount_code, p_store_id, v_order, 'in_person', v_priced);
    END IF;
    v_total := GREATEST(0, v_items_total - v_discount);
    UPDATE public.orders SET total_amount = v_total WHERE id = v_order;

    RETURN jsonb_build_object('order_id', v_order, 'items_total', v_items_total, 'discount', v_discount, 'total_amount', v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.create_in_person_sale(uuid, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_in_person_sale(uuid, jsonb, text, text, text) TO authenticated;

-- ============================================================
-- 5. Sem INSERT direto para clientes
-- ============================================================
DROP POLICY IF EXISTS orders_insert_all ON public.orders;
DROP POLICY IF EXISTS order_items_insert_all ON public.order_items;

-- ============================================================
-- 6. UPDATE em orders: a loja só mexe no status, por transições válidas
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_orders_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF (to_jsonb(NEW) - ARRAY['status', 'updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'updated_at']) THEN
        RAISE EXCEPTION 'Campo protegido do pedido: valores, vínculos e endereço não podem ser alterados' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT (
            (OLD.status = 'pending'   AND NEW.status IN ('preparing', 'rejected'))
         OR (OLD.status = 'preparing' AND NEW.status IN ('ready', 'paid', 'rejected'))
         OR (OLD.status = 'ready'     AND NEW.status IN ('paid', 'rejected'))
        ) THEN
            RAISE EXCEPTION 'Mudança de status do pedido não permitida: % → %', OLD.status, NEW.status USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_guard_update ON public.orders;
CREATE TRIGGER orders_guard_update
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_orders_update();

-- ============================================================
-- 7. DELETE: só pedido ainda pendente, sem entrega/corrida ligada
-- ============================================================
DROP POLICY IF EXISTS orders_delete_buyer ON public.orders;
CREATE POLICY orders_delete_buyer ON public.orders FOR DELETE TO authenticated
    USING (buyer_id = auth.uid() AND status = 'pending');

CREATE OR REPLACE FUNCTION public.guard_orders_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN OLD; END IF;
    IF OLD.status <> 'pending'
       OR EXISTS (SELECT 1 FROM public.order_delivery_dispatches d WHERE d.order_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.order_id = OLD.id) THEN
        RAISE EXCEPTION 'Este pedido já está em andamento e não pode ser apagado' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS orders_guard_delete ON public.orders;
CREATE TRIGGER orders_guard_delete
    BEFORE DELETE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_orders_delete();

-- ============================================================
-- 8. Integridade pedido ↔ corrida: a loja da corrida é a loja do pedido (vale para todos, inclusive servidor)
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_ride_order_link()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_store uuid;
BEGIN
    IF NEW.order_id IS NOT NULL THEN
        SELECT store_id INTO v_store FROM public.orders WHERE id = NEW.order_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Pedido da corrida não existe'; END IF;
        IF NEW.store_id IS DISTINCT FROM v_store THEN RAISE EXCEPTION 'A loja da corrida não é a loja do pedido'; END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ride_requests_validate_order_link ON public.ride_requests;
CREATE TRIGGER ride_requests_validate_order_link
    BEFORE INSERT OR UPDATE OF order_id, store_id ON public.ride_requests
    FOR EACH ROW EXECUTE FUNCTION public.validate_ride_order_link();

-- Menor privilégio: sem acesso anônimo nem TRUNCATE/REFERENCES/TRIGGER nas tabelas de pedido
REVOKE ALL ON public.orders, public.order_items FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.orders, public.order_items FROM authenticated;
