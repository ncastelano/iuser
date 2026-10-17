-- Etapa 2.4 — VINCULAÇÃO SEGURA DA ESTIMATIVA AO PEDIDO V2 E ENTREGA SÓ APÓS O ACEITE DA LOJA.
--
-- O V2 continua DESLIGADO: chave global e chaves das lojas seguem FALSE (CHECKs da 2.2/2.3). Esta migration só deixa o caminho
-- pronto e testável; com as chaves em FALSE o pedido nasce V1 exatamente como antes (create_store_order ignora a estimativa).
--
--  * orders.delivery_flow_version : 1 ou 2, decidido SÓ pelo servidor em create_store_order (chave global E da loja E loja com
--    entregador iUser E entrega). O app não envia versão; ninguém escreve a coluna pelo app (sem policy de INSERT, guarda de UPDATE).
--  * Pedido V2 nasce 'pending' (= aguardando a loja), SEM corrida, SEM entrega, SEM pagamento (payment_method='combinar').
--  * Estimativa (delivery_estimates): dono, loja, validade, não invalidada, não consumida, versão suportada, destino verificado e
--    IGUAL ao do pedido (endereço normalizado + coordenadas a ≤ 30 m). Consumo atômico (FOR UPDATE + order_id).
--  * Aceite da loja (pending→preparing): _start_order_delivery_dispatch cria a entrega V2 com estimate_id e estimated_freight,
--    fase PROCURANDO_ENTREGADOR; erro no V2 NÃO é engolido (o aceite falha por inteiro). Recusa: nada é criado.

-- ============================================================
-- 1. Versão do fluxo no pedido
-- ============================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_flow_version smallint NOT NULL DEFAULT 1;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivery_flow_version_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_flow_version_check CHECK (delivery_flow_version IN (1, 2));

-- ============================================================
-- 2. Estimativa: endereço (privado), invalidação, um pedido por estimativa
-- ============================================================
ALTER TABLE public.delivery_estimates ADD COLUMN IF NOT EXISTS destination_address text;
ALTER TABLE public.delivery_estimates ADD COLUMN IF NOT EXISTS invalidated_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_estimates_order_unique ON public.delivery_estimates (order_id) WHERE order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.delivery_estimates_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- valor, distância, destino e snapshot nunca mudam; só o vínculo com o pedido (nulo→pedido, pedido→nulo se o pedido for apagado
    -- antes de a loja agir) e a invalidação (nulo→data) podem mudar
    IF (to_jsonb(NEW) - 'order_id' - 'invalidated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'order_id' - 'invalidated_at')
       OR (OLD.order_id IS NOT NULL AND NEW.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id)
       OR (OLD.invalidated_at IS NOT NULL AND NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at) THEN
        RAISE EXCEPTION 'A estimativa é histórica e não pode ser alterada' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

-- normaliza endereço para comparar (minúsculas, espaços únicos)
CREATE OR REPLACE FUNCTION public._norm_address(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$ SELECT NULLIF(lower(regexp_replace(btrim(COALESCE(p, '')), '\s+', ' ', 'g')), '') $$;
REVOKE ALL ON FUNCTION public._norm_address(text) FROM PUBLIC, anon, authenticated;

-- registro da estimativa agora guarda o endereço (privado) e invalida as anteriores não usadas da mesma loja
DROP FUNCTION IF EXISTS public.record_delivery_estimate(uuid, uuid, double precision, double precision, integer, text, text);
CREATE OR REPLACE FUNCTION public.record_delivery_estimate(
    p_customer uuid,
    p_store uuid,
    p_lat double precision,
    p_lng double precision,
    p_distance_m integer,
    p_distance_source text,        -- 'route' (Mapbox Directions) | 'straight_line' (fallback haversine)
    p_destination_check text,      -- 'verified' (geocodificação confere) | 'unverified'
    p_address text                 -- endereço normalizado que o servidor geocodificou (coluna privada, fora do snapshot)
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    s public.stores;
    v_straight_m integer;
    v_radius numeric;
    v_calc jsonb;
    v_snap jsonb;
    v_id uuid;
    v_exp timestamptz := now() + interval '30 minutes';
    v_addr text := public._norm_address(p_address);
BEGIN
    IF v_addr IS NULL OR length(v_addr) < 5 THEN RAISE EXCEPTION 'Endereço inválido' USING ERRCODE = '22023'; END IF;
    IF p_distance_source NOT IN ('route', 'straight_line') OR p_destination_check NOT IN ('verified', 'unverified') THEN
        RAISE EXCEPTION 'Origem de distância inválida';
    END IF;
    IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -34 AND 6 OR p_lng NOT BETWEEN -74 AND -28 THEN
        RAISE EXCEPTION 'Destino fora do Brasil ou inválido' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO s FROM public.stores WHERE id = p_store;
    IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
    IF NOT (COALESCE(s.accepts_delivery, false) AND COALESCE(s.iuser_delivery_enabled, false)) THEN
        RAISE EXCEPTION 'Esta loja não usa a entrega iUser' USING ERRCODE = '22023';
    END IF;
    IF s.store_lat IS NULL OR s.store_lng IS NULL THEN RAISE EXCEPTION 'A loja não tem localização cadastrada'; END IF;

    v_straight_m := round(public.haversine_km(s.store_lat, s.store_lng, p_lat, p_lng) * 1000)::integer;
    SELECT max_radius_km INTO v_radius FROM public.delivery_dispatch_settings WHERE id;
    IF v_straight_m > v_radius * 1000 THEN
        RAISE EXCEPTION 'Endereço fora da área de entrega' USING ERRCODE = '22023';
    END IF;
    -- a rota nunca é bem mais curta que a linha reta: valor assim indica dado adulterado/defeituoso
    IF p_distance_source = 'route' AND p_distance_m < v_straight_m * 0.95 - 50 THEN
        RAISE EXCEPTION 'Distância de rota inconsistente' USING ERRCODE = '22023';
    END IF;
    IF p_distance_m > 400000 THEN RAISE EXCEPTION 'Distância inválida' USING ERRCODE = '22023'; END IF;
    IF (SELECT count(*) FROM public.delivery_estimates WHERE customer_id = p_customer AND created_at > now() - interval '1 hour') >= 60 THEN
        RAISE EXCEPTION 'Muitas estimativas em pouco tempo. Tente novamente mais tarde.' USING ERRCODE = '54000';
    END IF;

    v_calc := public._compute_delivery_estimate(p_distance_m);
    v_snap := v_calc || jsonb_build_object('distance_source', p_distance_source, 'destination_check', p_destination_check,
                                           'straight_line_m', v_straight_m, 'calculated_at', now());
    -- estimativa nova para a mesma loja substitui as anteriores ainda não usadas (só a mais recente vale)
    UPDATE public.delivery_estimates SET invalidated_at = now()
     WHERE customer_id = p_customer AND store_id = p_store AND order_id IS NULL AND invalidated_at IS NULL;
    INSERT INTO public.delivery_estimates (customer_id, store_id, destination_lat, destination_lng, destination_address, estimated_freight, distance_km,
                                           calculation_version, snapshot, expires_at)
    VALUES (p_customer, p_store, p_lat, p_lng, v_addr, (v_calc->>'final_cents')::integer / 100.0, round(p_distance_m / 1000.0, 3),
            v_calc->>'calculation_version', v_snap, v_exp)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('estimate_id', v_id, 'estimated_freight', round((v_calc->>'final_cents')::integer / 100.0, 2),
                              'distance_km', round(p_distance_m / 1000.0, 3), 'calculation_version', v_calc->>'calculation_version',
                              'expires_at', v_exp);
END;
$$;
REVOKE ALL ON FUNCTION public.record_delivery_estimate(uuid, uuid, double precision, double precision, integer, text, text, text) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3. Validação + consumo da estimativa no pedido V2 (chamada só por create_store_order)
--    Nunca chama Mapbox: reaproveita a verificação feita no momento da estimativa. Estimativa com destino "unverified",
--    expirada, de outro endereço/usuário/loja, já usada ou substituída é RECUSADA (o app pede uma nova).
-- ============================================================
CREATE OR REPLACE FUNCTION public._consume_delivery_estimate(
    p_estimate uuid, p_customer uuid, p_store uuid, p_address text, p_lat double precision, p_lng double precision
)
RETURNS public.delivery_estimates
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    e public.delivery_estimates;
BEGIN
    SELECT * INTO e FROM public.delivery_estimates WHERE id = p_estimate FOR UPDATE;
    IF NOT FOUND OR e.customer_id IS DISTINCT FROM p_customer OR e.store_id IS DISTINCT FROM p_store THEN
        RAISE EXCEPTION 'Estimativa da entrega inválida. Solicite uma nova.' USING ERRCODE = '22023', HINT = 'estimate_invalid';
    END IF;
    IF e.order_id IS NOT NULL THEN
        RAISE EXCEPTION 'Esta estimativa já foi usada em outro pedido. Solicite uma nova.' USING ERRCODE = '22023', HINT = 'estimate_used';
    END IF;
    IF e.invalidated_at IS NOT NULL THEN
        RAISE EXCEPTION 'A estimativa foi substituída por uma mais recente. Solicite uma nova.' USING ERRCODE = '22023', HINT = 'estimate_replaced';
    END IF;
    IF e.expires_at <= now() THEN
        RAISE EXCEPTION 'A estimativa da entrega expirou. Atualizamos o valor para você.' USING ERRCODE = '22023', HINT = 'estimate_expired';
    END IF;
    IF e.calculation_version NOT IN ('est-v1') THEN
        RAISE EXCEPTION 'Versão de cálculo da estimativa não suportada. Solicite uma nova.' USING ERRCODE = '22023', HINT = 'estimate_invalid';
    END IF;
    IF COALESCE(e.snapshot->>'destination_check', '') <> 'verified' OR e.destination_address IS NULL THEN
        RAISE EXCEPTION 'Não foi possível confirmar o endereço da entrega. Solicite uma nova estimativa.' USING ERRCODE = '22023', HINT = 'estimate_unverified';
    END IF;
    IF e.destination_address IS DISTINCT FROM public._norm_address(p_address)
       OR p_lat IS NULL OR p_lng IS NULL
       OR public.haversine_km(e.destination_lat, e.destination_lng, p_lat, p_lng) > 0.03 THEN
        RAISE EXCEPTION 'O endereço mudou depois da estimativa. Solicite uma nova.' USING ERRCODE = '22023', HINT = 'estimate_address_changed';
    END IF;
    RETURN e;
END;
$$;
REVOKE ALL ON FUNCTION public._consume_delivery_estimate(uuid, uuid, uuid, text, double precision, double precision) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 4. create_store_order com estimativa (V2) — sem estimativa/chaves ligadas segue idêntico ao V1
-- ============================================================
DROP FUNCTION IF EXISTS public.create_store_order(uuid, jsonb, text, text, text, double precision, double precision, numeric, boolean, text, uuid);
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
    p_checkout_id uuid DEFAULT NULL,
    p_estimate_id uuid DEFAULT NULL
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
$$;
REVOKE ALL ON FUNCTION public.create_store_order(uuid, jsonb, text, text, text, double precision, double precision, numeric, boolean, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_order(uuid, jsonb, text, text, text, double precision, double precision, numeric, boolean, text, uuid, uuid) TO authenticated;

-- o app só precisa saber QUAL caminho de tela usar (a decisão e a validação continuam no servidor)
CREATE OR REPLACE FUNCTION public.get_checkout_flow(p_store uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT CASE WHEN EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store AND COALESCE(s.accepts_delivery, false)
                                AND COALESCE(s.iuser_delivery_enabled, false)) AND public.store_uses_delivery_flow_v2(p_store)
                THEN 'v2' ELSE 'v1' END
$$;
REVOKE ALL ON FUNCTION public.get_checkout_flow(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_flow(uuid) TO authenticated;

-- ============================================================
-- 5. Aceite da loja → entrega (V1 igual; V2 com estimativa, fase inicial e falha visível)
-- ============================================================
CREATE OR REPLACE FUNCTION public._start_order_delivery_dispatch(p_order uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    o public.orders;
    s public.stores;
    cfg public.delivery_dispatch_settings;
    est public.delivery_estimates;
    v_existing uuid;
    v_ride uuid;
    v_dispatch uuid;
    v_dist numeric;
    v_items text;
    v_fee numeric;
    v_platform numeric;
    v_v2 boolean;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_v2 := o.delivery_flow_version = 2;
    SELECT id INTO v_existing FROM public.order_delivery_dispatches WHERE order_id = p_order;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

    SELECT * INTO s FROM public.stores WHERE id = o.store_id;
    IF NOT FOUND OR NOT s.iuser_delivery_enabled THEN
        IF v_v2 THEN RAISE EXCEPTION 'A loja não usa mais o entregador iUser; não é possível aceitar este pedido' USING ERRCODE = '22023'; END IF;
        RETURN NULL;
    END IF;
    IF o.delivery_address IS NULL OR COALESCE(o.delivery_fee, 0) <= 0 THEN
        IF v_v2 THEN RAISE EXCEPTION 'Pedido sem endereço ou frete válido' USING ERRCODE = '22023'; END IF;
        RETURN NULL;
    END IF;
    IF s.address IS NULL OR s.store_lat IS NULL OR s.store_lng IS NULL THEN
        IF v_v2 THEN RAISE EXCEPTION 'A loja não tem endereço cadastrado' USING ERRCODE = '22023'; END IF;
        RETURN NULL;
    END IF;

    IF v_v2 THEN
        SELECT * INTO est FROM public.delivery_estimates WHERE order_id = o.id;
        IF NOT FOUND OR est.estimated_freight IS DISTINCT FROM o.delivery_fee THEN
            RAISE EXCEPTION 'Pedido V2 sem estimativa oficial vinculada' USING ERRCODE = '22023';
        END IF;
    END IF;

    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;
    v_fee := o.delivery_fee;
    v_platform := round(v_fee * cfg.platform_fee_percent / 100, 2);

    IF o.delivery_lat IS NOT NULL AND o.delivery_lng IS NOT NULL THEN
        v_dist := round(public.haversine_km(s.store_lat, s.store_lng, o.delivery_lat, o.delivery_lng) * 1.3, 1);
    END IF;

    SELECT string_agg(quantity || 'x ' || product_name, ', ') INTO v_items FROM public.order_items WHERE order_id = o.id;

    -- corrida antiga do pedido (chamada manual de antes): reaproveita
    SELECT id INTO v_ride FROM public.ride_requests WHERE order_id = o.id AND status <> 'cancelled' LIMIT 1;
    IF v_ride IS NULL THEN
        INSERT INTO public.ride_requests (
            requester_id, ride_type, vehicle_type, origin_address, origin_lat, origin_lng,
            destination_address, destination_lat, destination_lng, distance_km, object_description,
            sender_name, recipient_name, offered_price, order_id, store_id, visible_radius_km
        ) VALUES (
            s.owner_id, 'objeto', 'moto', s.address, s.store_lat, s.store_lng,
            o.delivery_address, o.delivery_lat, o.delivery_lng, v_dist,
            left('Pedido da loja ' || s.name || COALESCE(': ' || v_items, ''), 300),
            s.name, o.buyer_name, v_fee - v_platform, o.id, s.id, cfg.initial_radius_km
        ) RETURNING id INTO v_ride;
    END IF;

    IF v_v2 THEN
        -- estimated_freight é a estimativa original e nunca mais muda; a oferta (final_freight) parte dela
        INSERT INTO public.order_delivery_dispatches (order_id, ride_request_id, store_id, customer_id, original_freight, final_freight, radius_km,
                                                      flow_version, phase, estimated_freight, estimate_id)
        VALUES (o.id, v_ride, s.id, o.buyer_id, v_fee, v_fee, cfg.initial_radius_km,
                2, 'PROCURANDO_ENTREGADOR', est.estimated_freight, est.id)
        RETURNING id INTO v_dispatch;
    ELSE
        INSERT INTO public.order_delivery_dispatches (order_id, ride_request_id, store_id, customer_id, original_freight, final_freight, radius_km)
        VALUES (o.id, v_ride, s.id, o.buyer_id, v_fee, v_fee, cfg.initial_radius_km)
        RETURNING id INTO v_dispatch;
    END IF;

    INSERT INTO public.order_delivery_rounds (dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status, authorized_at, authorized_by)
    VALUES (v_dispatch, 1, 'initial', v_fee, 0, v_fee, v_platform, v_fee - v_platform, cfg.initial_radius_km, 'authorized', now(), o.buyer_id);

    RETURN v_dispatch;
END;
$$;

CREATE OR REPLACE FUNCTION public.orders_start_delivery_on_accept()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'preparing' AND OLD.status IS DISTINCT FROM 'preparing' THEN
        IF NEW.delivery_flow_version = 2 THEN
            PERFORM public._start_order_delivery_dispatch(NEW.id);        -- V2: falha visível (o aceite não passa sem entrega)
        ELSE
            BEGIN
                PERFORM public._start_order_delivery_dispatch(NEW.id);
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'delivery dispatch failed for order %: %', NEW.id, SQLERRM;
            END;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- entrega V2 só nasce de um pedido V2 (decidido na criação) e com estimativa vinculada
CREATE OR REPLACE FUNCTION public.dispatch_flow_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.flow_version = 2 THEN
        IF NEW.estimate_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = NEW.order_id AND o.delivery_flow_version = 2) THEN
            RAISE EXCEPTION 'Entrega do novo fluxo exige pedido do novo fluxo e estimativa vinculada' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- auditoria: o evento da criação da entrega leva pedido, estimativa, valor, versão do cálculo e snapshot (sem endereço)
CREATE OR REPLACE FUNCTION public.audit_dispatch_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor uuid := auth.uid();
    v_role text := NULLIF(current_setting('app.delivery_actor', true), '');
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'estimate_recorded', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('estimated_freight', NEW.estimated_freight, 'original_freight', NEW.original_freight,
                                   'radius_km', NEW.radius_km, 'flow_version', NEW.flow_version, 'estimate_id', NEW.estimate_id,
                                   'order_id', NEW.order_id,
                                   'calculation_version', (SELECT e.calculation_version FROM public.delivery_estimates e WHERE e.id = NEW.estimate_id),
                                   'estimate_snapshot', (SELECT e.snapshot FROM public.delivery_estimates e WHERE e.id = NEW.estimate_id)), now());
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_from, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'phase_change', NULL, NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('status', NEW.status, 'stage', NEW.stage, 'flow_version', NEW.flow_version), now());
        RETURN NEW;
    END IF;

    IF NEW.phase IS DISTINCT FROM OLD.phase THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_from, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, CASE WHEN NEW.phase = 'CANCELADO' THEN 'cancelled' ELSE 'phase_change' END, OLD.phase, NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('status', NEW.status, 'stage', NEW.stage, 'flow_version', NEW.flow_version), now());
    END IF;
    IF NEW.frozen_freight IS NOT NULL AND OLD.frozen_freight IS NULL THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'freight_frozen', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('frozen_freight', NEW.frozen_freight, 'estimated_freight', NEW.estimated_freight, 'authorized_extra', NEW.authorized_extra), now());
    END IF;
    IF NEW.reserved_at IS NOT NULL AND OLD.reserved_at IS NULL THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'driver_reserved', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('reserved_until', NEW.reserved_until,
                                   'driver_id', (SELECT driver_id FROM public.ride_requests WHERE id = NEW.ride_request_id)), now());
    END IF;
    IF NEW.reservation_released_at IS NOT NULL AND OLD.reservation_released_at IS NULL THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'reservation_released', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('reason', NEW.reservation_release_reason), now());
    END IF;
    RETURN NEW;
END;
$function$;
