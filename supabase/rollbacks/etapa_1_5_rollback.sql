-- ROLLBACK da Etapa 1.5: restaura policies, grants, triggers e funções do estado ANTERIOR (gerado antes das mudanças).
-- Dados não são alterados pelas migrations 20261085+; este script devolve só as regras de acesso.
-- Rode com: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/rollbacks/etapa_1_5_rollback.sql
begin;
DROP POLICY IF EXISTS "odc_select" ON public.order_delivery_counters;
DROP POLICY IF EXISTS "odd_select" ON public.order_delivery_dispatches;
DROP POLICY IF EXISTS "odr_select" ON public.order_delivery_rounds;
DROP POLICY IF EXISTS "order_items_insert_all" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "orders_delete_buyer" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_all" ON public.orders;
DROP POLICY IF EXISTS "orders_select_buyer" ON public.orders;
DROP POLICY IF EXISTS "orders_select_store_owner" ON public.orders;
DROP POLICY IF EXISTS "orders_update_store_owner" ON public.orders;
DROP POLICY IF EXISTS "Candidato cancela candidatura de motorista" ON public.ride_applications;
DROP POLICY IF EXISTS "Candidato se candidata a pedido de motorista de outra pessoa" ON public.ride_applications;
DROP POLICY IF EXISTS "Candidato vê suas candidaturas de motorista" ON public.ride_applications;
DROP POLICY IF EXISTS "Dono decide candidaturas do seu pedido de motorista" ON public.ride_applications;
DROP POLICY IF EXISTS "Dono vê candidaturas do seu pedido de motorista" ON public.ride_applications;
DROP POLICY IF EXISTS "Autenticados veem pedidos de motorista abertos" ON public.ride_requests;
DROP POLICY IF EXISTS "Dono atualiza status e motorista do próprio pedido" ON public.ride_requests;
DROP POLICY IF EXISTS "Motorista aceito finaliza ou cancela a corrida" ON public.ride_requests;
DROP POLICY IF EXISTS "Motorista vê a corrida que aceitou" ON public.ride_requests;
DROP POLICY IF EXISTS "Usuário cria seus próprios pedidos de corrida" ON public.ride_requests;
DROP POLICY IF EXISTS "Usuário vê seus próprios pedidos de corrida" ON public.ride_requests;
DROP POLICY IF EXISTS "Visitantes veem pedidos de motorista abertos" ON public.ride_requests;
CREATE POLICY "odc_select" ON public.order_delivery_counters AS PERMISSIVE FOR SELECT TO authenticated USING (((driver_id = auth.uid()) OR (dispatch_id IN ( SELECT order_delivery_dispatches.id
   FROM order_delivery_dispatches
  WHERE (order_delivery_dispatches.customer_id = auth.uid())))));
CREATE POLICY "odd_select" ON public.order_delivery_dispatches AS PERMISSIVE FOR SELECT TO authenticated USING (((customer_id = auth.uid()) OR (store_id IN ( SELECT stores.id
   FROM stores
  WHERE (stores.owner_id = auth.uid())))));
CREATE POLICY "odr_select" ON public.order_delivery_rounds AS PERMISSIVE FOR SELECT TO authenticated USING ((dispatch_id IN ( SELECT order_delivery_dispatches.id
   FROM order_delivery_dispatches)));
CREATE POLICY "order_items_insert_all" ON public.order_items AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "order_items_select" ON public.order_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM orders
  WHERE ((orders.id = order_items.order_id) AND ((orders.buyer_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM stores
          WHERE ((stores.id = orders.store_id) AND (stores.owner_id = auth.uid())))))))));
CREATE POLICY "orders_delete_buyer" ON public.orders AS PERMISSIVE FOR DELETE TO public USING ((buyer_id = auth.uid()));
CREATE POLICY "orders_insert_all" ON public.orders AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "orders_select_buyer" ON public.orders AS PERMISSIVE FOR SELECT TO public USING ((buyer_id = auth.uid()));
CREATE POLICY "orders_select_store_owner" ON public.orders AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM stores
  WHERE ((stores.id = orders.store_id) AND (stores.owner_id = auth.uid())))));
CREATE POLICY "orders_update_store_owner" ON public.orders AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM stores
  WHERE ((stores.id = orders.store_id) AND (stores.owner_id = auth.uid())))));
CREATE POLICY "Candidato cancela candidatura de motorista" ON public.ride_applications AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = applicant_id));
CREATE POLICY "Candidato se candidata a pedido de motorista de outra pessoa" ON public.ride_applications AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() = applicant_id) AND (EXISTS ( SELECT 1
   FROM ride_requests rr
  WHERE ((rr.id = ride_applications.ride_request_id) AND (rr.requester_id <> auth.uid()) AND (rr.applicant_count < 5)))) AND ( SELECT get_active_plan_grants.has_driver
   FROM get_active_plan_grants(auth.uid()) get_active_plan_grants(has_driver, has_provider, has_store, has_recruiter)) AND (get_driver_postpaid_debt(auth.uid()) < (50)::numeric)));
CREATE POLICY "Candidato vê suas candidaturas de motorista" ON public.ride_applications AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = applicant_id));
CREATE POLICY "Dono decide candidaturas do seu pedido de motorista" ON public.ride_applications AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM ride_requests rr
  WHERE ((rr.id = ride_applications.ride_request_id) AND (rr.requester_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ride_requests rr
  WHERE ((rr.id = ride_applications.ride_request_id) AND (rr.requester_id = auth.uid())))));
CREATE POLICY "Dono vê candidaturas do seu pedido de motorista" ON public.ride_applications AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM ride_requests rr
  WHERE ((rr.id = ride_applications.ride_request_id) AND (rr.requester_id = auth.uid())))));
CREATE POLICY "Autenticados veem pedidos de motorista abertos" ON public.ride_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((status = 'pending'::text));
CREATE POLICY "Dono atualiza status e motorista do próprio pedido" ON public.ride_requests AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = requester_id)) WITH CHECK ((auth.uid() = requester_id));
CREATE POLICY "Motorista aceito finaliza ou cancela a corrida" ON public.ride_requests AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = driver_id)) WITH CHECK (((auth.uid() = driver_id) AND (status = ANY (ARRAY['accepted'::text, 'completed'::text, 'cancelled'::text]))));
CREATE POLICY "Motorista vê a corrida que aceitou" ON public.ride_requests AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = driver_id));
CREATE POLICY "Usuário cria seus próprios pedidos de corrida" ON public.ride_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = requester_id));
CREATE POLICY "Usuário vê seus próprios pedidos de corrida" ON public.ride_requests AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = requester_id));
CREATE POLICY "Visitantes veem pedidos de motorista abertos" ON public.ride_requests AS PERMISSIVE FOR SELECT TO anon USING ((status = 'pending'::text));
GRANT DELETE ON public.order_delivery_counters TO anon;
GRANT INSERT ON public.order_delivery_counters TO anon;
GRANT REFERENCES ON public.order_delivery_counters TO anon;
GRANT SELECT ON public.order_delivery_counters TO anon;
GRANT TRIGGER ON public.order_delivery_counters TO anon;
GRANT TRUNCATE ON public.order_delivery_counters TO anon;
GRANT UPDATE ON public.order_delivery_counters TO anon;
GRANT DELETE ON public.order_delivery_counters TO authenticated;
GRANT INSERT ON public.order_delivery_counters TO authenticated;
GRANT REFERENCES ON public.order_delivery_counters TO authenticated;
GRANT SELECT ON public.order_delivery_counters TO authenticated;
GRANT TRIGGER ON public.order_delivery_counters TO authenticated;
GRANT TRUNCATE ON public.order_delivery_counters TO authenticated;
GRANT UPDATE ON public.order_delivery_counters TO authenticated;
GRANT DELETE ON public.order_delivery_dispatches TO anon;
GRANT INSERT ON public.order_delivery_dispatches TO anon;
GRANT REFERENCES ON public.order_delivery_dispatches TO anon;
GRANT SELECT ON public.order_delivery_dispatches TO anon;
GRANT TRIGGER ON public.order_delivery_dispatches TO anon;
GRANT TRUNCATE ON public.order_delivery_dispatches TO anon;
GRANT UPDATE ON public.order_delivery_dispatches TO anon;
GRANT DELETE ON public.order_delivery_dispatches TO authenticated;
GRANT INSERT ON public.order_delivery_dispatches TO authenticated;
GRANT REFERENCES ON public.order_delivery_dispatches TO authenticated;
GRANT SELECT ON public.order_delivery_dispatches TO authenticated;
GRANT TRIGGER ON public.order_delivery_dispatches TO authenticated;
GRANT TRUNCATE ON public.order_delivery_dispatches TO authenticated;
GRANT UPDATE ON public.order_delivery_dispatches TO authenticated;
GRANT DELETE ON public.order_delivery_rounds TO anon;
GRANT INSERT ON public.order_delivery_rounds TO anon;
GRANT REFERENCES ON public.order_delivery_rounds TO anon;
GRANT SELECT ON public.order_delivery_rounds TO anon;
GRANT TRIGGER ON public.order_delivery_rounds TO anon;
GRANT TRUNCATE ON public.order_delivery_rounds TO anon;
GRANT UPDATE ON public.order_delivery_rounds TO anon;
GRANT DELETE ON public.order_delivery_rounds TO authenticated;
GRANT INSERT ON public.order_delivery_rounds TO authenticated;
GRANT REFERENCES ON public.order_delivery_rounds TO authenticated;
GRANT SELECT ON public.order_delivery_rounds TO authenticated;
GRANT TRIGGER ON public.order_delivery_rounds TO authenticated;
GRANT TRUNCATE ON public.order_delivery_rounds TO authenticated;
GRANT UPDATE ON public.order_delivery_rounds TO authenticated;
GRANT DELETE ON public.order_items TO anon;
GRANT INSERT ON public.order_items TO anon;
GRANT REFERENCES ON public.order_items TO anon;
GRANT SELECT ON public.order_items TO anon;
GRANT TRIGGER ON public.order_items TO anon;
GRANT TRUNCATE ON public.order_items TO anon;
GRANT UPDATE ON public.order_items TO anon;
GRANT DELETE ON public.order_items TO authenticated;
GRANT INSERT ON public.order_items TO authenticated;
GRANT REFERENCES ON public.order_items TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;
GRANT TRIGGER ON public.order_items TO authenticated;
GRANT TRUNCATE ON public.order_items TO authenticated;
GRANT UPDATE ON public.order_items TO authenticated;
GRANT DELETE ON public.orders TO anon;
GRANT INSERT ON public.orders TO anon;
GRANT REFERENCES ON public.orders TO anon;
GRANT SELECT ON public.orders TO anon;
GRANT TRIGGER ON public.orders TO anon;
GRANT TRUNCATE ON public.orders TO anon;
GRANT UPDATE ON public.orders TO anon;
GRANT DELETE ON public.orders TO authenticated;
GRANT INSERT ON public.orders TO authenticated;
GRANT REFERENCES ON public.orders TO authenticated;
GRANT SELECT ON public.orders TO authenticated;
GRANT TRIGGER ON public.orders TO authenticated;
GRANT TRUNCATE ON public.orders TO authenticated;
GRANT UPDATE ON public.orders TO authenticated;
GRANT DELETE ON public.ride_applications TO anon;
GRANT INSERT ON public.ride_applications TO anon;
GRANT REFERENCES ON public.ride_applications TO anon;
GRANT SELECT ON public.ride_applications TO anon;
GRANT TRIGGER ON public.ride_applications TO anon;
GRANT TRUNCATE ON public.ride_applications TO anon;
GRANT UPDATE ON public.ride_applications TO anon;
GRANT DELETE ON public.ride_applications TO authenticated;
GRANT INSERT ON public.ride_applications TO authenticated;
GRANT REFERENCES ON public.ride_applications TO authenticated;
GRANT SELECT ON public.ride_applications TO authenticated;
GRANT TRIGGER ON public.ride_applications TO authenticated;
GRANT TRUNCATE ON public.ride_applications TO authenticated;
GRANT UPDATE ON public.ride_applications TO authenticated;
GRANT DELETE ON public.ride_requests TO anon;
GRANT INSERT ON public.ride_requests TO anon;
GRANT REFERENCES ON public.ride_requests TO anon;
GRANT SELECT ON public.ride_requests TO anon;
GRANT TRIGGER ON public.ride_requests TO anon;
GRANT TRUNCATE ON public.ride_requests TO anon;
GRANT UPDATE ON public.ride_requests TO anon;
GRANT DELETE ON public.ride_requests TO authenticated;
GRANT INSERT ON public.ride_requests TO authenticated;
GRANT REFERENCES ON public.ride_requests TO authenticated;
GRANT SELECT ON public.ride_requests TO authenticated;
GRANT TRIGGER ON public.ride_requests TO authenticated;
GRANT TRUNCATE ON public.ride_requests TO authenticated;
GRANT UPDATE ON public.ride_requests TO authenticated;
CREATE OR REPLACE FUNCTION public._start_order_delivery_dispatch(p_order uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    o public.orders;
    s public.stores;
    cfg public.delivery_dispatch_settings;
    v_existing uuid;
    v_ride uuid;
    v_dispatch uuid;
    v_dist numeric;
    v_items text;
    v_fee numeric;
    v_platform numeric;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT id INTO v_existing FROM public.order_delivery_dispatches WHERE order_id = p_order;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

    SELECT * INTO s FROM public.stores WHERE id = o.store_id;
    IF NOT FOUND OR NOT s.iuser_delivery_enabled THEN RETURN NULL; END IF;
    IF o.delivery_address IS NULL OR COALESCE(o.delivery_fee, 0) <= 0 THEN RETURN NULL; END IF;
    IF s.address IS NULL OR s.store_lat IS NULL OR s.store_lng IS NULL THEN RETURN NULL; END IF;

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

    INSERT INTO public.order_delivery_dispatches (order_id, ride_request_id, store_id, customer_id, original_freight, final_freight, radius_km)
    VALUES (o.id, v_ride, s.id, o.buyer_id, v_fee, v_fee, cfg.initial_radius_km)
    RETURNING id INTO v_dispatch;

    INSERT INTO public.order_delivery_rounds (dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status, authorized_at, authorized_by)
    VALUES (v_dispatch, 1, 'initial', v_fee, 0, v_fee, v_platform, v_fee - v_platform, cfg.initial_radius_km, 'authorized', now(), o.buyer_id);

    RETURN v_dispatch;
END;
$function$;
CREATE OR REPLACE FUNCTION public.accrue_driver_postpaid_ride_fee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
       AND NEW.driver_id IS NOT NULL AND public.is_postpaid_user(NEW.driver_id) THEN
        INSERT INTO public.driver_postpaid_charges (driver_id, ride_request_id, type, amount)
        VALUES (NEW.driver_id, NEW.id, 'ride_fee', (SELECT postpaid_price FROM public.service_pricing WHERE service_type = 'ride_fee'))
        ON CONFLICT (ride_request_id) WHERE type = 'ride_fee' DO NOTHING;
    END IF;
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.accrue_postpaid_order_fee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_owner uuid;
BEGIN
    IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
        IF v_owner IS NOT NULL AND public.is_postpaid_user(v_owner) THEN
            IF NEW.buyer_id IS NULL THEN
                INSERT INTO public.driver_postpaid_charges (driver_id, order_id, type, amount)
                VALUES (v_owner, NEW.id, 'in_person_fee', (SELECT postpaid_price FROM public.service_pricing WHERE service_type = 'in_person_fee'))
                ON CONFLICT (order_id) WHERE type = 'in_person_fee' DO NOTHING;
            ELSE
                INSERT INTO public.driver_postpaid_charges (driver_id, order_id, type, amount)
                VALUES (v_owner, NEW.id, 'order_fee', (SELECT postpaid_price FROM public.service_pricing WHERE service_type = 'order_fee'))
                ON CONFLICT (order_id) WHERE type = 'order_fee' DO NOTHING;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END; $function$;
CREATE OR REPLACE FUNCTION public.auto_accept_store_delivery_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_offered numeric;
    v_order uuid;
    v_updated integer;
BEGIN
    SELECT offered_price, order_id INTO v_offered, v_order FROM public.ride_requests WHERE id = NEW.ride_request_id;
    IF v_order IS NOT NULL AND v_offered IS NOT NULL AND NEW.proposed_price = v_offered THEN
        UPDATE public.ride_requests
        SET status = 'accepted', driver_id = NEW.applicant_id
        WHERE id = NEW.ride_request_id AND status = 'pending';
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated > 0 THEN
            UPDATE public.ride_applications SET status = 'accepted' WHERE id = NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.block_orders_for_store_in_debt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_owner uuid;
BEGIN
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
    IF v_owner IS NOT NULL AND public.get_driver_postpaid_debt(v_owner) >= 50 THEN
        IF NEW.buyer_id IS NULL THEN
            RAISE EXCEPTION 'Sua dívida do pós-pago chegou a R$ 50. Quite pra registrar vendas presenciais.';
        END IF;
        RAISE EXCEPTION 'Esta loja está temporariamente sem receber novos pedidos.';
    END IF;
    RETURN NEW;
END; $function$;
CREATE OR REPLACE FUNCTION public.bump_ride_applicant_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.ride_requests SET applicant_count = applicant_count + 1 WHERE id = NEW.ride_request_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.ride_requests SET applicant_count = GREATEST(0, applicant_count - 1) WHERE id = OLD.ride_request_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.cancel_order_delivery(p_dispatch uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    d public.order_delivery_dispatches;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch FOR UPDATE;
    IF NOT FOUND OR d.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
    IF d.status <> 'searching' THEN RAISE EXCEPTION 'A entrega já tem motorista ou foi encerrada'; END IF;
    UPDATE public.ride_requests SET status = 'cancelled', cancelled_by = 'requester' WHERE id = d.ride_request_id AND status = 'pending';
    UPDATE public.order_delivery_rounds SET status = 'expired' WHERE dispatch_id = d.id AND status = 'pending_customer';
    UPDATE public.order_delivery_dispatches SET status = 'cancelled', updated_at = now() WHERE id = d.id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_delivery_counter(p_ride uuid, p_driver uuid, p_amount numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    d public.order_delivery_dispatches;
    cfg public.delivery_dispatch_settings;
    r record;
    dp record;
    v_platform numeric;
    v_id uuid;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = p_ride FOR UPDATE;
    IF NOT FOUND OR d.status <> 'searching' THEN RAISE EXCEPTION 'Essa entrega não está mais em busca'; END IF;
    SELECT requester_id, status, origin_lat, origin_lng, visible_radius_km INTO r FROM public.ride_requests WHERE id = p_ride;
    IF r.status <> 'pending' THEN RAISE EXCEPTION 'Essa entrega não está mais disponível'; END IF;
    IF r.requester_id = p_driver THEN RAISE EXCEPTION 'Você não pode propor na sua própria entrega'; END IF;

    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;
    IF p_amount <= d.final_freight THEN RAISE EXCEPTION 'A sua tarifa não é maior que o frete oferecido: aceite o frete'; END IF;
    IF p_amount > cfg.max_freight THEN RAISE EXCEPTION 'Valor acima do máximo permitido para entregas'; END IF;

    IF NOT (SELECT has_driver FROM public.get_active_plan_grants(p_driver)) THEN RAISE EXCEPTION 'Você precisa do plano de motorista'; END IF;
    IF public.get_driver_postpaid_debt(p_driver) >= 50 THEN RAISE EXCEPTION 'Quite sua pendência para aceitar corridas'; END IF;

    SELECT live_lat, live_lng, live_updated_at, delivery_radius_km INTO dp FROM public.driver_pricing WHERE driver_id = p_driver;
    IF r.visible_radius_km IS NOT NULL AND r.origin_lat IS NOT NULL AND dp.live_lat IS NOT NULL AND dp.live_updated_at > now() - interval '30 minutes'
       AND public.haversine_km(r.origin_lat, r.origin_lng, dp.live_lat, dp.live_lng) > LEAST(r.visible_radius_km, COALESCE(dp.delivery_radius_km, r.visible_radius_km)) THEN
        RAISE EXCEPTION 'Essa entrega está fora do seu raio' USING ERRCODE = '42501';
    END IF;

    v_platform := round(p_amount * cfg.platform_fee_percent / 100, 2);
    INSERT INTO public.order_delivery_counters (dispatch_id, driver_id, amount, platform_fee, driver_offer)
    VALUES (d.id, p_driver, p_amount, v_platform, p_amount - v_platform)
    RETURNING id INTO v_id;
    RETURN v_id;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Você já enviou uma proposta para essa entrega';
END;
$function$;
CREATE OR REPLACE FUNCTION public.enforce_delivery_radius()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    rr record;
    dp record;
    v_km numeric;
    v_limit numeric;
BEGIN
    IF current_setting('app.skip_delivery_radius', true) = '1' THEN RETURN NEW; END IF;
    SELECT order_id, visible_radius_km, origin_lat, origin_lng INTO rr FROM public.ride_requests WHERE id = NEW.ride_request_id;
    IF rr.order_id IS NULL OR rr.visible_radius_km IS NULL OR rr.origin_lat IS NULL THEN RETURN NEW; END IF;
    SELECT live_lat, live_lng, live_updated_at, delivery_radius_km INTO dp FROM public.driver_pricing WHERE driver_id = NEW.applicant_id;
    IF dp.live_lat IS NULL OR dp.live_lng IS NULL OR dp.live_updated_at IS NULL OR dp.live_updated_at < now() - interval '30 minutes' THEN
        RETURN NEW;
    END IF;
    v_limit := LEAST(rr.visible_radius_km, COALESCE(dp.delivery_radius_km, rr.visible_radius_km));
    v_km := public.haversine_km(rr.origin_lat, rr.origin_lng, dp.live_lat, dp.live_lng);
    IF v_km > v_limit THEN
        RAISE EXCEPTION 'Essa entrega está fora do seu raio (% km da loja, raio atual de % km)', round(v_km, 1), v_limit
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.orders_start_delivery_on_accept()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.status = 'preparing' AND OLD.status IS DISTINCT FROM 'preparing' THEN
        BEGIN
            PERFORM public._start_order_delivery_dispatch(NEW.id);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'delivery dispatch failed for order %: %', NEW.id, SQLERRM;
        END;
    END IF;
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.respond_delivery_counter(p_counter uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    c public.order_delivery_counters;
    d public.order_delivery_dispatches;
    cfg public.delivery_dispatch_settings;
    v_ride_status text;
    v_old_fee numeric;
    v_offered numeric;
BEGIN
    SELECT * INTO c FROM public.order_delivery_counters WHERE id = p_counter FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada'; END IF;
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = c.dispatch_id FOR UPDATE;
    IF d.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
    IF c.status <> 'pending_customer' THEN RAISE EXCEPTION 'Essa proposta não está mais disponível'; END IF;

    SELECT status INTO v_ride_status FROM public.ride_requests WHERE id = d.ride_request_id;
    IF d.status <> 'searching' OR v_ride_status IS DISTINCT FROM 'pending' THEN
        UPDATE public.order_delivery_counters SET status = 'expired', decided_at = now() WHERE id = c.id;
        RAISE EXCEPTION 'A entrega já não está em busca';
    END IF;

    IF NOT p_accept THEN
        UPDATE public.order_delivery_counters SET status = 'declined', decided_at = now() WHERE id = c.id;
        RETURN jsonb_build_object('accepted', false);
    END IF;

    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;
    IF c.amount > cfg.max_freight THEN RAISE EXCEPTION 'Valor acima do máximo permitido'; END IF;

    SELECT delivery_fee INTO v_old_fee FROM public.orders WHERE id = d.order_id;
    UPDATE public.orders
       SET delivery_fee = c.amount, total_amount = total_amount - COALESCE(v_old_fee, 0) + c.amount
     WHERE id = d.order_id;

    UPDATE public.order_delivery_counters SET status = 'authorized', decided_at = now() WHERE id = c.id;
    UPDATE public.order_delivery_counters SET status = 'expired', decided_at = now() WHERE dispatch_id = d.id AND id <> c.id AND status = 'pending_customer';
    UPDATE public.order_delivery_rounds SET status = 'expired' WHERE dispatch_id = d.id AND status = 'pending_customer';

    INSERT INTO public.order_delivery_rounds (dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status, authorized_at, authorized_by, proposed_by)
    VALUES (d.id, d.round + 1, 'driver_counter', d.original_freight, c.amount - d.original_freight, c.amount, c.platform_fee, c.driver_offer, d.radius_km, 'authorized', now(), auth.uid(), c.driver_id);
    UPDATE public.order_delivery_dispatches
       SET round = d.round + 1, authorized_extra = c.amount - d.original_freight, final_freight = c.amount, round_started_at = now(), updated_at = now()
     WHERE id = d.id;
    UPDATE public.ride_requests SET offered_price = c.driver_offer WHERE id = d.ride_request_id;

    -- o motorista que propôs fica com a entrega (a candidatura no valor da corrida o aceita sozinha)
    PERFORM set_config('app.skip_delivery_radius', '1', true);
    INSERT INTO public.ride_applications (ride_request_id, applicant_id, status, proposed_price)
    VALUES (d.ride_request_id, c.driver_id, 'pending', c.driver_offer)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('accepted', true, 'final_freight', c.amount, 'driver_offer', c.driver_offer);
END;
$function$;
CREATE OR REPLACE FUNCTION public.respond_delivery_increase(p_round uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r public.order_delivery_rounds;
    d public.order_delivery_dispatches;
    cfg public.delivery_dispatch_settings;
    v_ride_status text;
    v_old_fee numeric;
BEGIN
    SELECT * INTO r FROM public.order_delivery_rounds WHERE id = p_round FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada'; END IF;
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = r.dispatch_id FOR UPDATE;
    IF d.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
    IF r.status <> 'pending_customer' THEN RAISE EXCEPTION 'Essa proposta não está mais disponível'; END IF;

    SELECT status INTO v_ride_status FROM public.ride_requests WHERE id = d.ride_request_id;
    IF d.status <> 'searching' OR v_ride_status IS DISTINCT FROM 'pending' THEN
        UPDATE public.order_delivery_rounds SET status = 'expired' WHERE id = r.id;
        RAISE EXCEPTION 'A entrega já não está em busca';
    END IF;

    IF NOT p_accept THEN
        UPDATE public.order_delivery_rounds SET status = 'declined' WHERE id = r.id;
        RETURN jsonb_build_object('accepted', false, 'final_freight', d.final_freight);
    END IF;

    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;
    IF r.final_freight > cfg.max_freight THEN RAISE EXCEPTION 'Valor acima do máximo permitido'; END IF;

    SELECT delivery_fee INTO v_old_fee FROM public.orders WHERE id = d.order_id;
    UPDATE public.orders
       SET delivery_fee = r.final_freight,
           total_amount = total_amount - COALESCE(v_old_fee, 0) + r.final_freight
     WHERE id = d.order_id;

    UPDATE public.order_delivery_rounds SET status = 'authorized', authorized_at = now(), authorized_by = auth.uid() WHERE id = r.id;
    UPDATE public.order_delivery_dispatches
       SET authorized_extra = r.extra, final_freight = r.final_freight, round_started_at = now(), updated_at = now()
     WHERE id = d.id;
    UPDATE public.ride_requests SET offered_price = r.driver_offer WHERE id = d.ride_request_id;

    INSERT INTO public.order_delivery_events (dispatch_id, kind, new_radius, round_id) VALUES (d.id, 'price_raised', d.radius_km, r.id);
    PERFORM public._ping_delivery_events();

    RETURN jsonb_build_object('accepted', true, 'final_freight', r.final_freight, 'driver_offer', r.driver_offer);
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_dispatch_with_ride()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    d public.order_delivery_dispatches;
    v_stage text;
BEGIN
    IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = NEW.id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    v_stage := CASE
        WHEN NEW.status = 'cancelled' THEN 'cancelled'
        WHEN NEW.status = 'completed' THEN 'delivered'
        WHEN NEW.status = 'accepted' THEN
            CASE WHEN NEW.ride_started_at IS NOT NULL THEN 'in_transit'
                 WHEN NEW.driver_arrived_at IS NOT NULL THEN 'at_store'
                 WHEN NEW.driver_departed_at IS NOT NULL THEN 'to_store'
                 ELSE 'assigned' END
        ELSE 'searching' END;

    UPDATE public.order_delivery_dispatches
       SET stage = v_stage,
           status = CASE NEW.status WHEN 'accepted' THEN 'accepted' WHEN 'completed' THEN 'completed' WHEN 'cancelled' THEN 'cancelled' ELSE status END,
           updated_at = now()
     WHERE id = d.id;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status <> 'pending' THEN
            UPDATE public.order_delivery_rounds SET status = 'expired' WHERE status = 'pending_customer' AND dispatch_id = d.id;
            UPDATE public.order_delivery_counters SET status = 'expired', decided_at = now() WHERE status = 'pending_customer' AND dispatch_id = d.id;
        END IF;
        IF NEW.status = 'completed' THEN
            -- entregue: o pedido está finalizado
            UPDATE public.orders SET status = 'paid' WHERE id = d.order_id AND status IN ('preparing', 'ready');
            INSERT INTO public.order_delivery_events (dispatch_id, kind) VALUES (d.id, 'delivered');
            PERFORM public._ping_delivery_events();
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.trg_notify_ride_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_requester uuid;
BEGIN
    BEGIN
        SELECT requester_id INTO v_requester FROM public.ride_requests WHERE id = NEW.ride_request_id;
        PERFORM public._notify(v_requester, 'ride_application', NEW.applicant_id, NEW.ride_request_id,
            jsonb_build_object('price', NEW.proposed_price), 'rideapp:' || NEW.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
END; $function$;
CREATE OR REPLACE FUNCTION public.trg_notify_ride_selected()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.driver_id IS NOT NULL AND NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
        BEGIN
            PERFORM public._notify(NEW.driver_id, 'ride_selected', NEW.requester_id, NEW.id, '{}'::jsonb, 'rideSel:' || NEW.id || ':' || NEW.driver_id);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
    RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS order_push_notificatio ON public.orders;
CREATE TRIGGER order_push_notificatio AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://www.iuser.com.br/api/push/send-order-notification', 'POST', '{"Content-type":"application/json","x-webhook-secret":"oLJr2Fq90wd3L7N8nhMxz9JLPGdH0MuuA0RM3Mkb_pA"}', '{}', '5000');
DROP TRIGGER IF EXISTS orders_accrue_postpaid_fee ON public.orders;
CREATE TRIGGER orders_accrue_postpaid_fee AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION accrue_postpaid_order_fee();
DROP TRIGGER IF EXISTS orders_block_store_in_debt ON public.orders;
CREATE TRIGGER orders_block_store_in_debt BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION block_orders_for_store_in_debt();
DROP TRIGGER IF EXISTS orders_start_delivery_on_accept ON public.orders;
CREATE TRIGGER orders_start_delivery_on_accept AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION orders_start_delivery_on_accept();
DROP TRIGGER IF EXISTS set_orders_updated_at ON public.orders;
CREATE TRIGGER set_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS ride_applications_auto_accept_store_delivery ON public.ride_applications;
CREATE TRIGGER ride_applications_auto_accept_store_delivery AFTER INSERT ON public.ride_applications FOR EACH ROW EXECUTE FUNCTION auto_accept_store_delivery_application();
DROP TRIGGER IF EXISTS ride_applications_bump_count ON public.ride_applications;
CREATE TRIGGER ride_applications_bump_count AFTER INSERT OR DELETE ON public.ride_applications FOR EACH ROW EXECUTE FUNCTION bump_ride_applicant_count();
DROP TRIGGER IF EXISTS ride_applications_enforce_radius ON public.ride_applications;
CREATE TRIGGER ride_applications_enforce_radius BEFORE INSERT ON public.ride_applications FOR EACH ROW EXECUTE FUNCTION enforce_delivery_radius();
DROP TRIGGER IF EXISTS ride_applications_notify ON public.ride_applications;
CREATE TRIGGER ride_applications_notify AFTER INSERT ON public.ride_applications FOR EACH ROW EXECUTE FUNCTION trg_notify_ride_application();
DROP TRIGGER IF EXISTS ride_requests_accrue_postpaid_fee ON public.ride_requests;
CREATE TRIGGER ride_requests_accrue_postpaid_fee AFTER UPDATE OF status ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION accrue_driver_postpaid_ride_fee();
DROP TRIGGER IF EXISTS ride_requests_notify_selected ON public.ride_requests;
CREATE TRIGGER ride_requests_notify_selected AFTER UPDATE OF driver_id ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION trg_notify_ride_selected();
DROP TRIGGER IF EXISTS ride_requests_require_stop_reached ON public.ride_requests;
CREATE TRIGGER ride_requests_require_stop_reached BEFORE UPDATE OF status ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION require_stop_reached_before_completion();
DROP TRIGGER IF EXISTS ride_requests_sync_dispatch ON public.ride_requests;
CREATE TRIGGER ride_requests_sync_dispatch AFTER UPDATE OF status, driver_departed_at, driver_arrived_at, ride_started_at ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION sync_dispatch_with_ride();

-- ===== Remove o que a Etapa 1.5 CRIOU (migrations 20261085 a 20261089) =====
DROP TRIGGER IF EXISTS ride_requests_sync_offer ON public.ride_requests;
DROP TRIGGER IF EXISTS ride_requests_guard_insert ON public.ride_requests;
DROP TRIGGER IF EXISTS ride_requests_guard_update ON public.ride_requests;
DROP TRIGGER IF EXISTS ride_requests_validate_order_link ON public.ride_requests;
DROP TRIGGER IF EXISTS ride_applications_guard_update ON public.ride_applications;
DROP TRIGGER IF EXISTS ride_applications_guard_insert ON public.ride_applications;
DROP TRIGGER IF EXISTS orders_guard_update ON public.orders;
DROP TRIGGER IF EXISTS orders_guard_delete ON public.orders;
DROP FUNCTION IF EXISTS public.sync_ride_offer();
DROP FUNCTION IF EXISTS public.guard_ride_requests_insert();
DROP FUNCTION IF EXISTS public.guard_ride_requests_update();
DROP FUNCTION IF EXISTS public.guard_ride_applications_update();
DROP FUNCTION IF EXISTS public.guard_ride_applications_insert();
DROP FUNCTION IF EXISTS public.guard_orders_update();
DROP FUNCTION IF EXISTS public.guard_orders_delete();
DROP FUNCTION IF EXISTS public.validate_ride_order_link();
DROP FUNCTION IF EXISTS public.select_ride_driver(uuid, uuid);
DROP FUNCTION IF EXISTS public.complete_ride(uuid, double precision, double precision);
DROP FUNCTION IF EXISTS public.create_store_order(uuid, jsonb, text, text, text, double precision, double precision, numeric, boolean, text, uuid);
DROP FUNCTION IF EXISTS public.create_in_person_sale(uuid, jsonb, text, text, text);
DROP FUNCTION IF EXISTS public._compute_store_delivery_fee(uuid, double precision, double precision);
DROP FUNCTION IF EXISTS public._price_order_items(uuid, jsonb, boolean);
DROP FUNCTION IF EXISTS public._apply_campaign_discount(text, uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.can_apply_to_ride(uuid);
DROP FUNCTION IF EXISTS public._address_area(text);
DROP TABLE IF EXISTS public.ride_offers;
-- Atenção: o app desta versão lê ride_offers e chama as RPCs acima; ao reverter o banco, reverta também o código (git revert).
commit;
