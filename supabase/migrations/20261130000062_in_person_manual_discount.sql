-- 20261130000062_in_person_manual_discount.sql
--
-- VENDA NO BALCÃO NOVA (painel da loja da 3.0, desenho do laboratório /painel-teste): a loja pode dar um DESCONTO na hora
-- (sem / 5% / 10% / R$ 5 ou outro valor) além do código do Clube VIP. O desconto é da PRÓPRIA loja, na venda dela, por isso só
-- o dono chama a função (como antes). O banco continua calculando tudo: preço dos itens (`_price_order_items`), desconto do
-- código e, agora, o desconto manual — que é recusado se for negativo, tiver mais de 2 casas ou passar do que sobrar depois
-- do código (o total nunca fica negativo).
-- A assinatura ganha `p_manual_discount numeric DEFAULT 0` (chamadas antigas, com 5 argumentos, continuam iguais).
-- O resto da função é o MESMO da 20261088000000 (única definição até aqui).

DROP FUNCTION IF EXISTS public.create_in_person_sale(uuid, jsonb, text, text, text);

CREATE OR REPLACE FUNCTION public.create_in_person_sale(p_store_id uuid, p_items jsonb, p_buyer_name text, p_payment_method text, p_discount_code text DEFAULT NULL::text, p_manual_discount numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    s public.stores;
    v_priced jsonb;
    v_items_total numeric;
    v_discount numeric := 0;
    v_manual numeric := COALESCE(p_manual_discount, 0);
    v_total numeric;
    v_order uuid;
BEGIN
    SELECT * INTO s FROM public.stores WHERE id = p_store_id;
    IF NOT FOUND OR s.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF p_payment_method NOT IN ('dinheiro', 'pix', 'credito', 'debito') THEN RAISE EXCEPTION 'Forma de pagamento inválida'; END IF;
    IF v_manual < 0 OR v_manual <> round(v_manual, 2) THEN RAISE EXCEPTION 'Desconto inválido' USING HINT = 'manual_discount_invalid'; END IF;

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
    IF v_manual > GREATEST(0, v_items_total - v_discount) THEN
        RAISE EXCEPTION 'O desconto passa do valor da venda' USING HINT = 'manual_discount_too_big';
    END IF;
    v_total := GREATEST(0, v_items_total - v_discount - v_manual);
    UPDATE public.orders SET total_amount = v_total WHERE id = v_order;

    RETURN jsonb_build_object('order_id', v_order, 'items_total', v_items_total, 'discount', v_discount, 'manual_discount', v_manual, 'total_amount', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_in_person_sale(uuid, jsonb, text, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_in_person_sale(uuid, jsonb, text, text, text, numeric) TO authenticated;
