-- Rollback de 20261130000054_driver_before_store.sql: o pedido volta a chegar à loja na hora (a busca de entregador volta a começar só quando a loja aceita).
-- Pedidos que estiverem RETIDOS agora são liberados para a loja antes de remover a coluna.
-- (Os cenários desta etapa: supabase/tests/driver_before_store_scenarios.sql)

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'held-orders-expire';
UPDATE public.orders SET store_visible = true WHERE NOT store_visible AND status = 'pending';

DROP TRIGGER IF EXISTS order_dispatch_release_held ON public.order_delivery_dispatches;
DROP TRIGGER IF EXISTS orders_close_delivery_on_reject ON public.orders;
DROP FUNCTION IF EXISTS public._release_held_order_on_driver();
DROP FUNCTION IF EXISTS public._close_delivery_on_order_end();
DROP FUNCTION IF EXISTS public.switch_held_order_to_pickup(uuid);
DROP FUNCTION IF EXISTS public.cancel_held_order(uuid);
DROP FUNCTION IF EXISTS public.expire_held_orders();

-- push da loja: volta o gatilho de INSERT sem condição e some o de liberação
DO $$
DECLARE t record;
BEGIN
    FOR t IN SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal AND position('send-order-notification' IN encode(tgargs, 'escape')) > 0
    LOOP
        IF t.tgname LIKE '%\_released' THEN
            EXECUTE format('DROP TRIGGER %I ON public.orders', t.tgname);
        ELSIF t.def LIKE '%WHEN (new.store_visible)%' OR t.def LIKE '%WHEN (NEW.store_visible)%' THEN
            EXECUTE format('DROP TRIGGER %I ON public.orders', t.tgname);
            EXECUTE regexp_replace(t.def, ' WHEN \(new\.store_visible\)', '', 'i');
        END IF;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_store_order(p_store_id uuid, p_items jsonb, p_delivery_option text, p_payment_method text, p_address text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_cash_change_for numeric DEFAULT NULL::numeric, p_card_is_contactless boolean DEFAULT NULL::boolean, p_discount_code text DEFAULT NULL::text, p_checkout_id uuid DEFAULT NULL::uuid, p_estimate_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_v2 boolean := false;
    v_est public.delivery_estimates;
    v_pay text := p_payment_method;
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
        -- A versão do fluxo é decisão do SERVIDOR (chave global E da loja). O app nunca escolhe nem envia a versão.
        v_v2 := COALESCE(s.iuser_delivery_enabled, false) AND public.store_uses_delivery_flow_v2(p_store_id);
        IF v_v2 THEN
            -- V2: o frete é a estimativa oficial já apresentada (validada e consumida aqui); nada de frete vindo do app
            IF p_estimate_id IS NULL THEN
                RAISE EXCEPTION 'Solicite a estimativa da entrega antes de enviar o pedido' USING ERRCODE = '22023', HINT = 'estimate_required';
            END IF;
            v_est := public._consume_delivery_estimate(p_estimate_id, v_uid, p_store_id, p_address, p_lat, p_lng);
            v_fee := v_est.estimated_freight;
            v_pay := 'combinar';      -- ainda não há pagamento: o pedido só aguarda a decisão da loja
        ELSE
            v_fee := round(public._compute_store_delivery_fee(p_store_id, p_lat, p_lng), 2);
        END IF;
    ELSE
        IF NOT COALESCE(s.accepts_pickup, true) THEN RAISE EXCEPTION 'Esta loja não tem retirada no local'; END IF;
    END IF;

    INSERT INTO public.orders (
        store_id, buyer_id, buyer_name, buyer_profile_slug, total_amount, delivery_fee, delivery_option, payment_method,
        delivery_address, delivery_lat, delivery_lng, cash_change_for, card_is_contactless, status, checkout_id, delivery_flow_version
    ) VALUES (
        p_store_id, v_uid, pf.name, pf.slug, 0, v_fee, v_option, v_pay,
        CASE WHEN v_option = 'entrega' THEN btrim(p_address) ELSE 'Retirada no local' END,
        CASE WHEN v_option = 'entrega' THEN p_lat::numeric END,
        CASE WHEN v_option = 'entrega' THEN p_lng::numeric END,
        CASE WHEN p_payment_method = 'dinheiro' AND p_cash_change_for IS NOT NULL AND p_cash_change_for >= 0 THEN p_cash_change_for END,
        CASE WHEN p_payment_method = 'cartao' THEN p_card_is_contactless END,
        'pending', v_checkout, CASE WHEN v_v2 THEN 2 ELSE 1 END
    ) RETURNING id INTO v_order;

    IF v_v2 THEN
        UPDATE public.delivery_estimates SET order_id = v_order WHERE id = v_est.id;   -- estimativa consumida por este pedido
    END IF;

    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price, comment, addons)
    SELECT v_order, x.product_id, x.product_name, x.quantity, x.unit_price, x.total_price, x.comment, x.addons
      FROM public._price_order_items(p_store_id, p_items, true) x;

    IF p_discount_code IS NOT NULL AND btrim(p_discount_code) <> '' THEN
        v_discount := public._apply_campaign_discount(p_discount_code, p_store_id, v_order, 'cart', v_priced);
    END IF;

    v_total := GREATEST(0, v_items_total - v_discount + v_fee);
    UPDATE public.orders SET total_amount = v_total WHERE id = v_order;

    RETURN jsonb_build_object('order_id', v_order, 'checkout_id', v_checkout, 'items_total', v_items_total,
                              'discount', v_discount, 'delivery_fee', v_fee, 'total_amount', v_total,
                              'flow_version', CASE WHEN v_v2 THEN 2 ELSE 1 END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_notify_order_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    s public.stores;
    v_buyer text;
    v_money text := 'R$ ' || replace(to_char(COALESCE(NEW.total_amount, 0), 'FM999G990D00'), '.', ',');
    v_driver uuid;
    v_path text;
    v_dig_n int := 0; v_dig_name text; v_dig_product uuid;
BEGIN
    SELECT * INTO s FROM public.stores WHERE id = NEW.store_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    v_buyer := public._person_label(NEW.buyer_id);
    v_path := '/painel-loja/' || s."storeSlug";

    -- pedido SÓ de produtos digitais (curso, música, programa)? conta quantos e guarda o primeiro, para o texto do aviso
    SELECT count(*), (array_agg(COALESCE(NULLIF(p.name, ''), oi.product_name) ORDER BY oi.id))[1], (array_agg(p.id ORDER BY oi.id))[1]
      INTO v_dig_n, v_dig_name, v_dig_product
      FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id
     WHERE oi.order_id = NEW.id AND p.type = 'digital';
    IF v_dig_n > 0 AND EXISTS (SELECT 1 FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id WHERE oi.order_id = NEW.id AND p.type <> 'digital') THEN v_dig_n := 0; END IF;   -- carrinho misto segue o aviso comum

    -- pedido novo: o total só fica certo depois que o banco calcula os itens (o pedido nasce com 0): avisa quando houver valor — e só se a loja já puder ver o pedido
    IF (TG_OP = 'INSERT' AND COALESCE(NEW.total_amount, 0) > 0) OR (TG_OP = 'UPDATE' AND COALESCE(OLD.total_amount, 0) <= 0 AND COALESCE(NEW.total_amount, 0) > 0 AND NEW.status = 'pending') THEN
        IF v_dig_n > 0 THEN
            -- pedido SÓ de produto digital: não tem preparo nem entrega, o que a loja precisa fazer é conferir o Pix e liberar o acesso
            PERFORM public._notify(s.owner_id, 'digital_order_new', NEW.buyer_id, NEW.id,
                jsonb_build_object('title', 'Pedido digital novo', 'text', v_buyer || ' quer "' || v_dig_name || '"' || CASE WHEN v_dig_n > 1 THEN ' e mais ' || (v_dig_n - 1) ELSE '' END || ' · ' || v_money || ' · libere o acesso quando receber o Pix', 'path', v_path || '/pedidos', 'store_id', s.id, 'amount', NEW.total_amount),
                'o:' || NEW.id || ':new');
        ELSE
        PERFORM public._notify(s.owner_id, 'order_new', NEW.buyer_id, NEW.id,
            jsonb_build_object('title', 'Pedido novo', 'text', v_buyer || ' pediu · ' || v_money || CASE WHEN NEW.delivery_option = 'entrega' THEN ' · entrega' ELSE ' · retirada' END, 'path', v_path, 'store_id', s.id, 'amount', NEW.total_amount),
            'o:' || NEW.id || ':new');
        END IF;
    END IF;
    IF TG_OP = 'INSERT' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

    IF NEW.status = 'preparing' THEN
        PERFORM public._notify(NEW.buyer_id, 'order_accepted', s.owner_id, NEW.id,
            jsonb_build_object('title', 'Pedido aceito', 'text', s.name || ' aceitou seu pedido e já está preparando', 'path', '/carrinho?aba=pedidos', 'store', s.name), 'o:' || NEW.id || ':preparing');
    ELSIF NEW.status = 'ready' THEN
        PERFORM public._notify(NEW.buyer_id, 'order_ready', s.owner_id, NEW.id,
            jsonb_build_object('title', 'Pedido pronto', 'text', CASE WHEN NEW.delivery_option = 'entrega' THEN s.name || ': seu pedido está pronto, o motorista vai buscar' ELSE s.name || ': seu pedido está pronto para retirar' END, 'path', '/carrinho?aba=pedidos', 'store', s.name), 'o:' || NEW.id || ':ready');
        -- o motorista que já aceitou a entrega fica sabendo que pode retirar
        SELECT r.driver_id INTO v_driver FROM public.ride_requests r WHERE r.order_id = NEW.id AND r.status = 'accepted' AND r.driver_id IS NOT NULL LIMIT 1;
        IF v_driver IS NOT NULL THEN
            PERFORM public._notify(v_driver, 'delivery_order_ready', s.owner_id, NEW.id,
                jsonb_build_object('title', 'Pedido pronto', 'text', 'O pedido de ' || v_buyer || ' na ' || s.name || ' está pronto para retirar', 'path', '/entregas', 'store', s.name), 'o:' || NEW.id || ':driver_ready');
        END IF;
    ELSIF NEW.status = 'rejected' THEN
        PERFORM public._notify(NEW.buyer_id, 'order_rejected', s.owner_id, NEW.id,
            jsonb_build_object('title', 'Pedido recusado', 'text', s.name || ' não pôde atender seu pedido', 'path', '/carrinho?aba=pedidos', 'store', s.name), 'o:' || NEW.id || ':rejected');
    ELSIF NEW.status = 'paid' THEN
        IF v_dig_n > 0 THEN
            -- a loja confirmou o pagamento de um pedido SÓ digital: o acesso abriu (a sala de aula/música é o destino; com vários produtos, a biblioteca)
            PERFORM public._notify(NEW.buyer_id, 'digital_access_released', s.owner_id, NEW.id,
                jsonb_build_object('title', 'Acesso liberado', 'text', s.name || ' liberou "' || v_dig_name || '"' || CASE WHEN v_dig_n > 1 THEN ' e mais ' || (v_dig_n - 1) ELSE '' END || ' — toque para começar',
                    'path', CASE WHEN v_dig_n = 1 AND v_dig_product IS NOT NULL THEN '/minhas-compras-digitais/' || v_dig_product ELSE '/minhas-compras-digitais' END, 'store', s.name), 'o:' || NEW.id || ':delivered');
        ELSE
        PERFORM public._notify(NEW.buyer_id, 'order_delivered', s.owner_id, NEW.id,
            jsonb_build_object('title', 'Pedido entregue', 'text', 'Seu pedido da ' || s.name || ' foi entregue. Conta como foi!', 'path', '/carrinho?aba=pedidos', 'store', s.name), 'o:' || NEW.id || ':delivered');
        END IF;
    END IF;
    RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS orders_zz_notify_events ON public.orders;
CREATE TRIGGER orders_zz_notify_events AFTER INSERT OR UPDATE OF status, total_amount ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_order_events();

DROP POLICY IF EXISTS orders_select_store_owner ON public.orders;
CREATE POLICY orders_select_store_owner ON public.orders FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = orders.store_id AND stores.owner_id = auth.uid()));
DROP POLICY IF EXISTS orders_update_store_owner ON public.orders;
CREATE POLICY orders_update_store_owner ON public.orders FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = orders.store_id AND stores.owner_id = auth.uid()));
DROP POLICY IF EXISTS odd_select ON public.order_delivery_dispatches;
CREATE POLICY odd_select ON public.order_delivery_dispatches FOR SELECT
    USING (customer_id = auth.uid() OR store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
DROP FUNCTION IF EXISTS public._order_store_visible(uuid);

-- o tipo de aviso novo sai do CHECK (avisos já gravados desse tipo são apagados antes)
DELETE FROM public.profile_notifications WHERE kind IN ('order_no_driver', 'delivery_order_preparing');
DO $$
DECLARE v_name text; v_def text;
BEGIN
    SELECT conname, pg_get_constraintdef(oid) INTO v_name, v_def FROM pg_constraint
     WHERE conrelid = 'public.profile_notifications'::regclass AND contype = 'c' AND (pg_get_constraintdef(oid) LIKE '%order_no_driver%' OR pg_get_constraintdef(oid) LIKE '%delivery_order_preparing%') LIMIT 1;
    IF v_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.profile_notifications DROP CONSTRAINT %I', v_name);
        EXECUTE format('ALTER TABLE public.profile_notifications ADD CONSTRAINT %I %s', v_name, replace(replace(v_def, ', ''order_no_driver''::text', ''), ', ''delivery_order_preparing''::text', ''));
    END IF;
END $$;

DROP FUNCTION IF EXISTS public.get_delivery_hold_settings();
DROP TABLE IF EXISTS public.delivery_hold_settings;
DROP INDEX IF EXISTS public.idx_orders_held;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_closed_reason_check;
ALTER TABLE public.orders DROP COLUMN IF EXISTS closed_reason;
ALTER TABLE public.orders DROP COLUMN IF EXISTS store_visible;
