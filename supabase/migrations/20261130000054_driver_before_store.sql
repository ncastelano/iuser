-- 20261130000054_driver_before_store.sql
--
-- ENTREGADOR PRIMEIRO, LOJA DEPOIS (fluxo atual, V1). Antes: o pedido de entrega iUser chegava à loja na hora, a loja aceitava, preparava, e SÓ ENTÃO
-- se procurava motorista — se ninguém aceitasse, o pedido pronto ficava parado na loja. Agora: um pedido que precisa de entregador do iUser nasce "RETIDO"
-- (`orders.store_visible = false`): a loja NÃO o enxerga e NÃO é avisada; a busca por motorista começa NA HORA; e o pedido é LIBERADO para a loja
-- (`store_visible = true` + aviso de "Pedido novo") quando um entregador ACEITA. Sem entregador:
--   * depois de `suggest_after_minutes` o app sugere ao cliente RETIRAR NA LOJA (`switch_held_order_to_pickup`: sem frete, vai para a loja como retirada);
--   * o cliente pode CANCELAR o pedido retido (`cancel_held_order`);
--   * passado `timeout_minutes` o pedido é cancelado sozinho (`expire_held_orders`, pg_cron) e o cliente é avisado (`order_no_driver`).
-- Vale só para o fluxo V1 com Entregador iUser da loja ligado, endereço de entrega, frete > 0 e a loja com endereço/localização (as mesmas condições em que a
-- busca já nascia). Entrega própria da loja, retirada, venda presencial, pedido V2 e pedido pelo WhatsApp seguem EXATAMENTE como antes. Interruptor:
-- `delivery_hold_settings.enabled` (sem tela; por SQL).
-- Também corrige uma falha: recusar um pedido que já tinha busca/corrida NÃO encerrava a corrida (continuava aberta para os motoristas).
-- Rollback: supabase/rollbacks/driver_before_store_rollback.sql — cenários: supabase/tests/driver_before_store_scenarios.sql

-- ============================================================
-- 1. Colunas e configuração
-- ============================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS store_visible boolean NOT NULL DEFAULT true;     -- false = retido, a loja ainda não vê o pedido
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS closed_reason text;                               -- 'no_driver' | 'customer_cancelled' (pedido encerrado sem a loja ter visto)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_closed_reason_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_closed_reason_check CHECK (closed_reason IS NULL OR closed_reason IN ('no_driver', 'customer_cancelled'));
CREATE INDEX IF NOT EXISTS idx_orders_held ON public.orders (created_at) WHERE NOT store_visible;

CREATE TABLE IF NOT EXISTS public.delivery_hold_settings (
    id                    boolean PRIMARY KEY DEFAULT true CHECK (id),
    enabled               boolean NOT NULL DEFAULT true,
    suggest_after_minutes integer NOT NULL DEFAULT 3  CHECK (suggest_after_minutes BETWEEN 1 AND 120),
    timeout_minutes       integer NOT NULL DEFAULT 15 CHECK (timeout_minutes BETWEEN 2 AND 240),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_hold_settings_order CHECK (suggest_after_minutes < timeout_minutes)
);
INSERT INTO public.delivery_hold_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.delivery_hold_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_hold_settings FROM PUBLIC, anon, authenticated;

-- o app só precisa dos prazos (quando sugerir a retirada)
CREATE OR REPLACE FUNCTION public.get_delivery_hold_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT jsonb_build_object('enabled', enabled, 'suggest_after_minutes', suggest_after_minutes, 'timeout_minutes', timeout_minutes) FROM public.delivery_hold_settings WHERE id $$;
REVOKE ALL ON FUNCTION public.get_delivery_hold_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_delivery_hold_settings() TO authenticated;

-- ============================================================
-- 2. A loja não enxerga (nem mexe em) pedido retido
-- ============================================================
CREATE OR REPLACE FUNCTION public._order_store_visible(p_order uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT store_visible FROM public.orders WHERE id = p_order), true) $$;
REVOKE ALL ON FUNCTION public._order_store_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._order_store_visible(uuid) TO authenticated;

DROP POLICY IF EXISTS orders_select_store_owner ON public.orders;
CREATE POLICY orders_select_store_owner ON public.orders FOR SELECT
    USING (store_visible AND EXISTS (SELECT 1 FROM public.stores WHERE stores.id = orders.store_id AND stores.owner_id = auth.uid()));
DROP POLICY IF EXISTS orders_update_store_owner ON public.orders;
CREATE POLICY orders_update_store_owner ON public.orders FOR UPDATE
    USING (store_visible AND EXISTS (SELECT 1 FROM public.stores WHERE stores.id = orders.store_id AND stores.owner_id = auth.uid()));

-- a entrega do pedido retido também não aparece para a loja (o cliente continua vendo a dele)
DO $$
DECLARE v_using text;
BEGIN
    SELECT pg_get_expr(polqual, polrelid) INTO v_using FROM pg_policy WHERE polrelid = 'public.order_delivery_dispatches'::regclass AND polname = 'odd_select';
    IF v_using IS NOT NULL AND v_using NOT LIKE '%_order_store_visible%' THEN
        DROP POLICY odd_select ON public.order_delivery_dispatches;
        CREATE POLICY odd_select ON public.order_delivery_dispatches FOR SELECT
            USING (customer_id = auth.uid() OR (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()) AND public._order_store_visible(order_id)));
    END IF;
END $$;

-- ============================================================
-- 3. O pedido nasce retido (entrega iUser) e a busca começa na hora
-- ============================================================
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
    v_hold boolean := false;
    v_dispatch uuid;
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
            -- ENTREGADOR PRIMEIRO: com o Entregador iUser da loja (e tudo o que a busca precisa), o pedido fica RETIDO até um motorista aceitar
            v_hold := COALESCE(s.iuser_delivery_enabled, false)
                      AND s.address IS NOT NULL AND s.store_lat IS NOT NULL AND s.store_lng IS NOT NULL
                      AND v_fee > 0
                      AND COALESCE((SELECT enabled FROM public.delivery_hold_settings WHERE id), true);
        END IF;
    ELSE
        IF NOT COALESCE(s.accepts_pickup, true) THEN RAISE EXCEPTION 'Esta loja não tem retirada no local'; END IF;
    END IF;

    INSERT INTO public.orders (
        store_id, buyer_id, buyer_name, buyer_profile_slug, total_amount, delivery_fee, delivery_option, payment_method,
        delivery_address, delivery_lat, delivery_lng, cash_change_for, card_is_contactless, status, checkout_id, delivery_flow_version, store_visible
    ) VALUES (
        p_store_id, v_uid, pf.name, pf.slug, 0, v_fee, v_option, v_pay,
        CASE WHEN v_option = 'entrega' THEN btrim(p_address) ELSE 'Retirada no local' END,
        CASE WHEN v_option = 'entrega' THEN p_lat::numeric END,
        CASE WHEN v_option = 'entrega' THEN p_lng::numeric END,
        CASE WHEN p_payment_method = 'dinheiro' AND p_cash_change_for IS NOT NULL AND p_cash_change_for >= 0 THEN p_cash_change_for END,
        CASE WHEN p_payment_method = 'cartao' THEN p_card_is_contactless END,
        'pending', v_checkout, CASE WHEN v_v2 THEN 2 ELSE 1 END, NOT v_hold
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

    IF v_hold THEN
        -- a busca começa AGORA (a corrida e a entrega nascem com o pedido); se por algum motivo não der para começar, o pedido segue o caminho de sempre (vai à loja)
        BEGIN
            v_dispatch := public._start_order_delivery_dispatch(v_order);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'busca de entregador não começou para o pedido %: %', v_order, SQLERRM;
            v_dispatch := NULL;
        END;
        IF v_dispatch IS NULL THEN
            UPDATE public.orders SET store_visible = true WHERE id = v_order;
            v_hold := false;
        END IF;
    END IF;

    RETURN jsonb_build_object('order_id', v_order, 'checkout_id', v_checkout, 'items_total', v_items_total,
                              'discount', v_discount, 'delivery_fee', v_fee, 'total_amount', v_total,
                              'flow_version', CASE WHEN v_v2 THEN 2 ELSE 1 END,
                              'awaiting_driver', v_hold);
END;
$function$;

-- ============================================================
-- 4. A loja só é avisada quando o pedido chega até ela (na criação normal ou ao ser liberado)
-- ============================================================
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
    v_released boolean := false;
    v_drv_name text;
BEGIN
    SELECT * INTO s FROM public.stores WHERE id = NEW.store_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    v_buyer := public._person_label(NEW.buyer_id);
    v_path := '/painel-loja/' || s."storeSlug";
    v_released := TG_OP = 'UPDATE' AND NOT OLD.store_visible AND NEW.store_visible;   -- o pedido retido acabou de chegar à loja (um entregador aceitou)
    IF v_released THEN
        -- quem aceitou a entrega (primeiro nome): o aviso diz quem vem buscar
        SELECT split_part(COALESCE(NULLIF(btrim(p.name), ''), ''), ' ', 1) INTO v_drv_name FROM public.ride_requests r JOIN public.profiles p ON p.id = r.driver_id
         WHERE r.order_id = NEW.id AND r.status = 'accepted' AND r.driver_id IS NOT NULL LIMIT 1;
        IF v_drv_name = '' THEN v_drv_name := NULL; END IF;
    END IF;

    -- pedido SÓ de produtos digitais (curso, música, programa)? conta quantos e guarda o primeiro, para o texto do aviso
    SELECT count(*), (array_agg(COALESCE(NULLIF(p.name, ''), oi.product_name) ORDER BY oi.id))[1], (array_agg(p.id ORDER BY oi.id))[1]
      INTO v_dig_n, v_dig_name, v_dig_product
      FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id
     WHERE oi.order_id = NEW.id AND p.type = 'digital';
    IF v_dig_n > 0 AND EXISTS (SELECT 1 FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id WHERE oi.order_id = NEW.id AND p.type <> 'digital') THEN v_dig_n := 0; END IF;   -- carrinho misto segue o aviso comum

    -- pedido novo: o total só fica certo depois que o banco calcula os itens (o pedido nasce com 0): avisa quando houver valor — e só se a loja já puder ver o pedido
    IF NEW.store_visible AND (
           (TG_OP = 'INSERT' AND COALESCE(NEW.total_amount, 0) > 0)
        OR (TG_OP = 'UPDATE' AND COALESCE(OLD.total_amount, 0) <= 0 AND COALESCE(NEW.total_amount, 0) > 0 AND NEW.status = 'pending')
        OR (v_released AND NEW.status = 'pending' AND COALESCE(NEW.total_amount, 0) > 0)
    ) THEN
        IF v_dig_n > 0 THEN
            -- pedido SÓ de produto digital: não tem preparo nem entrega, o que a loja precisa fazer é conferir o Pix e liberar o acesso
            PERFORM public._notify(s.owner_id, 'digital_order_new', NEW.buyer_id, NEW.id,
                jsonb_build_object('title', 'Pedido digital novo', 'text', v_buyer || ' quer "' || v_dig_name || '"' || CASE WHEN v_dig_n > 1 THEN ' e mais ' || (v_dig_n - 1) ELSE '' END || ' · ' || v_money || ' · libere o acesso quando receber o Pix', 'path', v_path || '/pedidos', 'store_id', s.id, 'amount', NEW.total_amount),
                'o:' || NEW.id || ':new');
        ELSE
        PERFORM public._notify(s.owner_id, 'order_new', NEW.buyer_id, NEW.id,
            jsonb_build_object('title', 'Pedido novo', 'text', v_buyer || ' pediu · ' || v_money || CASE WHEN NEW.delivery_option = 'entrega' THEN CASE WHEN v_released THEN ' · entrega: ' || COALESCE(v_drv_name, 'entregador') || ' vai buscar' ELSE ' · entrega' END ELSE ' · retirada' END, 'path', v_path, 'store_id', s.id, 'amount', NEW.total_amount),
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
        IF NEW.closed_reason = 'no_driver' THEN
            -- pedido retido que ninguém entregou: a loja nunca viu; só o cliente é avisado
            PERFORM public._notify(NEW.buyer_id, 'order_no_driver', NULL, NEW.id,
                jsonb_build_object('title', 'Não achamos um entregador', 'text', 'Ninguém aceitou a entrega do seu pedido da ' || s.name || ' e ele foi cancelado. Peça de novo para retirar na loja.', 'path', '/atividade?aba=pedidos', 'store', s.name), 'o:' || NEW.id || ':no_driver');
        ELSIF NEW.closed_reason IS NULL THEN
            PERFORM public._notify(NEW.buyer_id, 'order_rejected', s.owner_id, NEW.id,
                jsonb_build_object('title', 'Pedido recusado', 'text', s.name || ' não pôde atender seu pedido', 'path', '/carrinho?aba=pedidos', 'store', s.name), 'o:' || NEW.id || ':rejected');
        END IF;   -- cancelado pelo próprio cliente: sem aviso
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
CREATE TRIGGER orders_zz_notify_events AFTER INSERT OR UPDATE OF status, total_amount, store_visible ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_order_events();

-- novo tipo de aviso: pedido retido que ninguém entregou
DO $$
DECLARE v_name text; v_def text;
BEGIN
    SELECT conname, pg_get_constraintdef(oid) INTO v_name, v_def FROM pg_constraint
     WHERE conrelid = 'public.profile_notifications'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%''order_new''::text%' LIMIT 1;
    IF v_name IS NOT NULL AND v_def NOT LIKE '%order_no_driver%' THEN
        EXECUTE format('ALTER TABLE public.profile_notifications DROP CONSTRAINT %I', v_name);
        EXECUTE format('ALTER TABLE public.profile_notifications ADD CONSTRAINT %I %s', v_name, replace(v_def, '''order_new''::text', '''order_new''::text, ''order_no_driver''::text'));
    END IF;
END $$;

-- o push do aparelho da loja (Database Webhook em INSERT): só dispara com o pedido visível à loja e, de novo, quando um pedido retido é liberado
DO $$
DECLARE t record; v_def text;
BEGIN
    FOR t IN SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger
              WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal AND position('send-order-notification' IN encode(tgargs, 'escape')) > 0
    LOOP
        IF t.def LIKE '%WHEN%' THEN CONTINUE; END IF;   -- já ajustado
        EXECUTE format('DROP TRIGGER %I ON public.orders', t.tgname);
        EXECUTE replace(t.def, 'AFTER INSERT ON public.orders FOR EACH ROW', 'AFTER INSERT ON public.orders FOR EACH ROW WHEN (NEW.store_visible)');
        v_def := replace(replace(t.def, 'CREATE TRIGGER ' || t.tgname, 'CREATE TRIGGER ' || left(t.tgname, 40) || '_released'),
                         'AFTER INSERT ON public.orders FOR EACH ROW', 'AFTER UPDATE OF store_visible ON public.orders FOR EACH ROW WHEN (NOT OLD.store_visible AND NEW.store_visible)');
        EXECUTE v_def;
    END LOOP;
END $$;

-- ============================================================
-- 5. Um entregador aceitou: o pedido retido chega à loja
-- ============================================================
CREATE OR REPLACE FUNCTION public._release_held_order_on_driver()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    UPDATE public.orders SET store_visible = true WHERE id = NEW.order_id AND NOT store_visible AND status = 'pending';
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_dispatch_release_held ON public.order_delivery_dispatches;
CREATE TRIGGER order_dispatch_release_held AFTER UPDATE OF status ON public.order_delivery_dispatches
    FOR EACH ROW WHEN (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
    EXECUTE FUNCTION public._release_held_order_on_driver();

-- ============================================================
-- 6. Pedido recusado/cancelado encerra a busca e a corrida (antes a corrida ficava aberta para os motoristas)
-- ============================================================
CREATE OR REPLACE FUNCTION public._close_delivery_on_order_end()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.delivery_flow_version = 1 THEN
        UPDATE public.ride_requests SET status = 'cancelled', cancelled_by = 'requester'
         WHERE order_id = NEW.id AND status IN ('pending', 'accepted') AND ride_started_at IS NULL;
        UPDATE public.order_delivery_dispatches SET status = 'cancelled', updated_at = now()
         WHERE order_id = NEW.id AND status = 'searching';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_close_delivery_on_reject ON public.orders;
CREATE TRIGGER orders_close_delivery_on_reject AFTER UPDATE OF status ON public.orders
    FOR EACH ROW WHEN (NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected')
    EXECUTE FUNCTION public._close_delivery_on_order_end();

-- ============================================================
-- 7. O cliente decide enquanto procura: retirar na loja ou cancelar
-- ============================================================
CREATE OR REPLACE FUNCTION public.switch_held_order_to_pickup(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    o public.orders;
    s public.stores;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND OR o.buyer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF o.store_visible OR o.status <> 'pending' THEN RAISE EXCEPTION 'Este pedido já está com a loja' USING HINT = 'not_held'; END IF;
    SELECT * INTO s FROM public.stores WHERE id = o.store_id;
    IF NOT COALESCE(s.accepts_pickup, true) THEN RAISE EXCEPTION 'Esta loja não tem retirada no local' USING HINT = 'no_pickup'; END IF;

    -- a busca termina (sem motorista) e o pedido segue para a loja como RETIRADA, sem frete
    UPDATE public.ride_requests SET status = 'cancelled', cancelled_by = 'requester' WHERE order_id = o.id AND status IN ('pending', 'accepted');
    UPDATE public.order_delivery_dispatches SET status = 'cancelled', updated_at = now() WHERE order_id = o.id AND status IN ('searching', 'accepted');
    UPDATE public.order_delivery_rounds SET status = 'expired' WHERE status = 'pending_customer' AND dispatch_id IN (SELECT id FROM public.order_delivery_dispatches WHERE order_id = o.id);
    UPDATE public.orders
       SET delivery_option = 'retirada', delivery_address = 'Retirada no local', delivery_lat = NULL, delivery_lng = NULL,
           total_amount = GREATEST(0, total_amount - COALESCE(delivery_fee, 0)), delivery_fee = 0, store_visible = true
     WHERE id = o.id;
    RETURN jsonb_build_object('ok', true, 'total_amount', (SELECT total_amount FROM public.orders WHERE id = o.id));
END $$;
REVOKE ALL ON FUNCTION public.switch_held_order_to_pickup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_held_order_to_pickup(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_held_order(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE o public.orders;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND OR o.buyer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF o.store_visible OR o.status <> 'pending' THEN RAISE EXCEPTION 'Este pedido já está com a loja' USING HINT = 'not_held'; END IF;
    UPDATE public.orders SET status = 'rejected', closed_reason = 'customer_cancelled' WHERE id = o.id;   -- o gatilho encerra a corrida e a busca
    RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.cancel_held_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_held_order(uuid) TO authenticated;

-- ============================================================
-- 8. Ninguém aceitou a tempo: o pedido retido é cancelado e o cliente é avisado (a loja nunca viu)
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_held_orders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_min integer;
    r record;
    n integer := 0;
BEGIN
    SELECT timeout_minutes INTO v_min FROM public.delivery_hold_settings WHERE id;
    FOR r IN SELECT id FROM public.orders WHERE NOT store_visible AND status = 'pending' AND created_at + make_interval(mins => COALESCE(v_min, 15)) <= now() FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            UPDATE public.orders SET status = 'rejected', closed_reason = 'no_driver' WHERE id = r.id;
            n := n + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'expire_held_orders: pedido % não encerrado: %', r.id, SQLERRM;
        END;
    END LOOP;
    RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.expire_held_orders() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'held-orders-expire';
SELECT cron.schedule('held-orders-expire', '* * * * *', $job$SELECT public.expire_held_orders()$job$);
