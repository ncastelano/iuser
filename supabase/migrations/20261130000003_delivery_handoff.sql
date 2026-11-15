-- Retirada e volume das entregas de loja (motorista agrupa; a loja confere e libera a retirada por CÓDIGO).
--  1) products.delivery_units: quanto cada unidade ocupa na mochila (a loja define; padrão 1); ride_requests/ride_offers.delivery_units + items_count calculados NO BANCO ao abrir a corrida.
--  2) driver_vehicles.delivery_capacity_units: o motorista diz quanto cabe em VOLUME; a candidatura confere (além do nº de entregas).
--  3) delivery_pickup_codes: ao CHEGAR na loja o banco gera um código de 4 dígitos para (loja, motorista); só a loja o enxerga (get_store_pickup_codes)
--     e o motorista só retira com ele (confirm_pickup) — com os pedidos PRONTOS, 5 erros travam por 5 min. O motorista não grava mais ride_started_at direto.
--  4) get_store_delivery_board: o painel da loja (entregadores com carga x capacidade, saídas por período, entregadores perto).
-- Rollback: supabase/rollbacks/delivery_handoff_rollback.sql

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS delivery_units numeric(5,2) NOT NULL DEFAULT 1 CHECK (delivery_units > 0 AND delivery_units <= 50);
ALTER TABLE public.ride_requests ADD COLUMN IF NOT EXISTS delivery_units numeric(7,2), ADD COLUMN IF NOT EXISTS items_count integer;
ALTER TABLE public.ride_offers ADD COLUMN IF NOT EXISTS delivery_units numeric(7,2), ADD COLUMN IF NOT EXISTS items_count integer;
ALTER TABLE public.driver_vehicles ADD COLUMN IF NOT EXISTS delivery_capacity_units numeric(5,2) CHECK (delivery_capacity_units IS NULL OR (delivery_capacity_units > 0 AND delivery_capacity_units <= 100));

-- Volume e itens da corrida de pedido: calculados do pedido (o app não manda)
CREATE OR REPLACE FUNCTION public.set_ride_delivery_units() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.order_id IS NOT NULL THEN
        SELECT COALESCE(sum(oi.quantity * COALESCE(p.delivery_units, 1)), 1), COALESCE(sum(oi.quantity), 1)::int
          INTO NEW.delivery_units, NEW.items_count
          FROM public.order_items oi LEFT JOIN public.products p ON p.id = oi.product_id WHERE oi.order_id = NEW.order_id;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ride_requests_set_units ON public.ride_requests;
CREATE TRIGGER ride_requests_set_units BEFORE INSERT ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION public.set_ride_delivery_units();

-- Corridas de pedido que já existem
UPDATE public.ride_requests r SET delivery_units = x.u, items_count = x.n
  FROM (SELECT oi.order_id, COALESCE(sum(oi.quantity * COALESCE(p.delivery_units, 1)), 1) AS u, COALESCE(sum(oi.quantity), 1)::int AS n
          FROM public.order_items oi LEFT JOIN public.products p ON p.id = oi.product_id GROUP BY oi.order_id) x
 WHERE r.order_id = x.order_id AND r.delivery_units IS NULL;

CREATE OR REPLACE FUNCTION public.sync_ride_offer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r public.ride_requests;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.ride_offers WHERE id = OLD.id;
        RETURN OLD;
    END IF;
    r := NEW;
    IF r.status <> 'pending' THEN
        DELETE FROM public.ride_offers WHERE id = r.id;
        RETURN NEW;
    END IF;
    INSERT INTO public.ride_offers (id, requester_id, ride_type, origin_address, destination_address, notes, status, created_at, passenger_count, vehicle_type, origin_needs_access, origin_access_notes, destination_needs_access, destination_access_notes, has_shopping, has_extra_object, has_child, has_pet, object_description, object_is_sensitive, object_size, is_grocery_shopping, bag_count, extra_object_description, pet_description, origin_lat, origin_lng, destination_lat, destination_lng, distance_km, duration_min, child_age, child_needs_car_seat, scheduled_for, children_count, applicant_count, has_special_needs, special_needs_description, extra_object_count, pet_count, origin_complement, destination_complement, special_needs_wheelchair, special_needs_wheelchair_type, special_needs_visual_impairment, has_guide_dog, pet_weight_range, pet_has_carrier, delivery_location, payment_method, cash_change_for, grocery_bag_size, card_is_contactless, wants_air_conditioning, offered_price, order_id, store_id, stop1_address, stop1_complement, stop1_lat, stop1_lng, stop2_address, stop2_complement, stop2_lat, stop2_lng, preferred_driver_id, visible_radius_km, delivery_units, items_count)
    VALUES (
        r.id,
        CASE WHEN r.order_id IS NOT NULL THEN r.requester_id ELSE NULL END,
        r.ride_type,
        CASE WHEN r.order_id IS NOT NULL THEN r.origin_address ELSE COALESCE(public._offer_place(r.origin_address), 'Região aproximada') END,
        COALESCE(public._offer_place(r.destination_address), 'Região aproximada'),
        NULL,
        r.status,
        r.created_at,
        r.passenger_count,
        r.vehicle_type,
        r.origin_needs_access,
        NULL,
        r.destination_needs_access,
        NULL,
        r.has_shopping,
        r.has_extra_object,
        r.has_child,
        r.has_pet,
        r.object_description,
        r.object_is_sensitive,
        r.object_size,
        r.is_grocery_shopping,
        r.bag_count,
        r.extra_object_description,
        r.pet_description,
        CASE WHEN r.order_id IS NOT NULL THEN r.origin_lat ELSE round(r.origin_lat::numeric, 2)::double precision END,
        CASE WHEN r.order_id IS NOT NULL THEN r.origin_lng ELSE round(r.origin_lng::numeric, 2)::double precision END,
        round(r.destination_lat::numeric, 2)::double precision,
        round(r.destination_lng::numeric, 2)::double precision,
        r.distance_km,
        r.duration_min,
        r.child_age,
        r.child_needs_car_seat,
        r.scheduled_for,
        r.children_count,
        r.applicant_count,
        r.has_special_needs,
        NULL,
        r.extra_object_count,
        r.pet_count,
        NULL,
        NULL,
        r.special_needs_wheelchair,
        r.special_needs_wheelchair_type,
        r.special_needs_visual_impairment,
        r.has_guide_dog,
        r.pet_weight_range,
        r.pet_has_carrier,
        r.delivery_location,
        r.payment_method,
        r.cash_change_for,
        r.grocery_bag_size,
        r.card_is_contactless,
        r.wants_air_conditioning,
        r.offered_price,
        r.order_id,
        r.store_id,
        CASE WHEN r.stop1_address IS NULL THEN NULL ELSE COALESCE(public._offer_place(r.stop1_address), 'Região aproximada') END,
        r.stop1_complement,
        round(r.stop1_lat::numeric, 2)::double precision,
        round(r.stop1_lng::numeric, 2)::double precision,
        CASE WHEN r.stop2_address IS NULL THEN NULL ELSE COALESCE(public._offer_place(r.stop2_address), 'Região aproximada') END,
        r.stop2_complement,
        round(r.stop2_lat::numeric, 2)::double precision,
        round(r.stop2_lng::numeric, 2)::double precision,
        r.preferred_driver_id,
        r.visible_radius_km,
        r.delivery_units,
        r.items_count
    )
    ON CONFLICT (id) DO UPDATE SET
        requester_id = EXCLUDED.requester_id,
        ride_type = EXCLUDED.ride_type,
        origin_address = EXCLUDED.origin_address,
        destination_address = EXCLUDED.destination_address,
        notes = EXCLUDED.notes,
        status = EXCLUDED.status,
        created_at = EXCLUDED.created_at,
        passenger_count = EXCLUDED.passenger_count,
        vehicle_type = EXCLUDED.vehicle_type,
        origin_needs_access = EXCLUDED.origin_needs_access,
        origin_access_notes = EXCLUDED.origin_access_notes,
        destination_needs_access = EXCLUDED.destination_needs_access,
        destination_access_notes = EXCLUDED.destination_access_notes,
        has_shopping = EXCLUDED.has_shopping,
        has_extra_object = EXCLUDED.has_extra_object,
        has_child = EXCLUDED.has_child,
        has_pet = EXCLUDED.has_pet,
        object_description = EXCLUDED.object_description,
        object_is_sensitive = EXCLUDED.object_is_sensitive,
        object_size = EXCLUDED.object_size,
        is_grocery_shopping = EXCLUDED.is_grocery_shopping,
        bag_count = EXCLUDED.bag_count,
        extra_object_description = EXCLUDED.extra_object_description,
        pet_description = EXCLUDED.pet_description,
        origin_lat = EXCLUDED.origin_lat,
        origin_lng = EXCLUDED.origin_lng,
        destination_lat = EXCLUDED.destination_lat,
        destination_lng = EXCLUDED.destination_lng,
        distance_km = EXCLUDED.distance_km,
        duration_min = EXCLUDED.duration_min,
        child_age = EXCLUDED.child_age,
        child_needs_car_seat = EXCLUDED.child_needs_car_seat,
        scheduled_for = EXCLUDED.scheduled_for,
        children_count = EXCLUDED.children_count,
        applicant_count = EXCLUDED.applicant_count,
        has_special_needs = EXCLUDED.has_special_needs,
        special_needs_description = EXCLUDED.special_needs_description,
        extra_object_count = EXCLUDED.extra_object_count,
        pet_count = EXCLUDED.pet_count,
        origin_complement = EXCLUDED.origin_complement,
        destination_complement = EXCLUDED.destination_complement,
        special_needs_wheelchair = EXCLUDED.special_needs_wheelchair,
        special_needs_wheelchair_type = EXCLUDED.special_needs_wheelchair_type,
        special_needs_visual_impairment = EXCLUDED.special_needs_visual_impairment,
        has_guide_dog = EXCLUDED.has_guide_dog,
        pet_weight_range = EXCLUDED.pet_weight_range,
        pet_has_carrier = EXCLUDED.pet_has_carrier,
        delivery_location = EXCLUDED.delivery_location,
        payment_method = EXCLUDED.payment_method,
        cash_change_for = EXCLUDED.cash_change_for,
        grocery_bag_size = EXCLUDED.grocery_bag_size,
        card_is_contactless = EXCLUDED.card_is_contactless,
        wants_air_conditioning = EXCLUDED.wants_air_conditioning,
        offered_price = EXCLUDED.offered_price,
        order_id = EXCLUDED.order_id,
        store_id = EXCLUDED.store_id,
        stop1_address = EXCLUDED.stop1_address,
        stop1_complement = EXCLUDED.stop1_complement,
        stop1_lat = EXCLUDED.stop1_lat,
        stop1_lng = EXCLUDED.stop1_lng,
        stop2_address = EXCLUDED.stop2_address,
        stop2_complement = EXCLUDED.stop2_complement,
        stop2_lat = EXCLUDED.stop2_lat,
        stop2_lng = EXCLUDED.stop2_lng,
        preferred_driver_id = EXCLUDED.preferred_driver_id,
        visible_radius_km = EXCLUDED.visible_radius_km,
        delivery_units = EXCLUDED.delivery_units,
        items_count = EXCLUDED.items_count;
    RETURN NEW;
END;
$function$;

UPDATE public.ride_offers o SET delivery_units = r.delivery_units, items_count = r.items_count FROM public.ride_requests r WHERE r.id = o.id AND o.delivery_units IS NULL;

CREATE OR REPLACE FUNCTION public.guard_ride_requests_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    uid uuid := auth.uid();
    is_req boolean := (uid IS NOT NULL AND uid = OLD.requester_id);
    is_drv boolean := (uid IS NOT NULL AND OLD.driver_id IS NOT NULL AND uid = OLD.driver_id);
    allowed text[] := '{}';
    expected text;
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF NOT (is_req OR is_drv) THEN
        RAISE EXCEPTION 'Sem permissão para alterar esta corrida' USING ERRCODE = '42501';
    END IF;

    -- Colunas que cada papel pode mexer. Todo o resto (preço, loja, pedido, motorista, endereços...) é do servidor.
    IF is_req THEN allowed := allowed || ARRAY['status', 'cancelled_by']; END IF;
    IF is_drv THEN
        allowed := allowed || ARRAY['status', 'cancelled_by', 'driver_en_route', 'driver_departed_at', 'driver_arrived_at',
                                    'ride_started_at', 'stop1_reached_at', 'stop2_reached_at',
                                    'extra_task_minutes', 'extra_task_fee', 'extra_task_description'];
    END IF;
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
        RAISE EXCEPTION 'Campo protegido: só o servidor altera preço, vínculos e dados da corrida' USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        -- A única mudança de status direta é cancelar; aceitar e concluir têm função própria.
        IF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'accepted') THEN
            expected := CASE WHEN is_req THEN 'requester' ELSE 'driver' END;
            IF NEW.cancelled_by IS DISTINCT FROM expected THEN
                RAISE EXCEPTION 'cancelled_by inválido' USING ERRCODE = '42501';
            END IF;
            IF NOT is_req AND OLD.status <> 'accepted' THEN
                RAISE EXCEPTION 'O motorista só cancela corrida que aceitou' USING ERRCODE = '42501';
            END IF;
        ELSE
            RAISE EXCEPTION 'Mudança de status não permitida por aqui (use a operação própria: aceitar, concluir ou cancelar)' USING ERRCODE = '42501';
        END IF;
    ELSIF NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by THEN
        RAISE EXCEPTION 'cancelled_by só muda ao cancelar' USING ERRCODE = '42501';
    END IF;

    -- Entrega de loja tem frete FIXO: o motorista não registra "tarefa extra" (valor a mais) nela
    IF OLD.order_id IS NOT NULL
       AND (NEW.extra_task_minutes, NEW.extra_task_fee, NEW.extra_task_description)
           IS DISTINCT FROM (OLD.extra_task_minutes, OLD.extra_task_fee, OLD.extra_task_description) THEN
        RAISE EXCEPTION 'O frete de entrega de loja é fixo: não aceita tarefa extra' USING ERRCODE = '42501';
    END IF;

    -- Entrega de loja: a RETIRADA só vale com o código da loja (confirm_pickup); o motorista não grava ride_started_at direto
    IF OLD.order_id IS NOT NULL AND NEW.ride_started_at IS DISTINCT FROM OLD.ride_started_at THEN
        RAISE EXCEPTION 'A retirada de um pedido de loja exige o código de retirada (a loja informa ao conferir o que entregou)' USING ERRCODE = '42501', HINT = 'pickup_code_required';
    END IF;

    -- Etapas do motorista só existem com a corrida aceita, e uma vez gravadas não são reescritas.
    IF (NEW.driver_en_route, NEW.driver_departed_at, NEW.driver_arrived_at, NEW.ride_started_at, NEW.stop1_reached_at, NEW.stop2_reached_at,
        NEW.extra_task_minutes, NEW.extra_task_fee, NEW.extra_task_description)
       IS DISTINCT FROM
       (OLD.driver_en_route, OLD.driver_departed_at, OLD.driver_arrived_at, OLD.ride_started_at, OLD.stop1_reached_at, OLD.stop2_reached_at,
        OLD.extra_task_minutes, OLD.extra_task_fee, OLD.extra_task_description) THEN
        IF OLD.status <> 'accepted' THEN
            RAISE EXCEPTION 'Etapas da corrida só podem ser registradas com a corrida aceita' USING ERRCODE = '42501';
        END IF;
        IF (OLD.driver_departed_at IS NOT NULL AND NEW.driver_departed_at IS DISTINCT FROM OLD.driver_departed_at)
           OR (OLD.driver_arrived_at IS NOT NULL AND NEW.driver_arrived_at IS DISTINCT FROM OLD.driver_arrived_at)
           OR (OLD.ride_started_at IS NOT NULL AND NEW.ride_started_at IS DISTINCT FROM OLD.ride_started_at)
           OR (OLD.stop1_reached_at IS NOT NULL AND NEW.stop1_reached_at IS DISTINCT FROM OLD.stop1_reached_at)
           OR (OLD.stop2_reached_at IS NOT NULL AND NEW.stop2_reached_at IS DISTINCT FROM OLD.stop2_reached_at) THEN
            RAISE EXCEPTION 'Etapa já registrada não pode ser alterada' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_ride_applications_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_offered numeric;
    v_order uuid;
    v_active integer;
    v_cap integer;
    v_units numeric;
    v_cap_units numeric;
    v_new_units numeric;
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF NEW.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Candidatura nova começa pendente' USING ERRCODE = '42501';
    END IF;
    IF NEW.proposed_price IS NOT NULL AND (NEW.proposed_price <= 0 OR NEW.proposed_price > 100000) THEN
        RAISE EXCEPTION 'Valor inválido' USING ERRCODE = '42501';
    END IF;
    -- O frete de entrega de loja é fixo: quem aceita, aceita o valor oferecido (nada de preço próprio por aqui)
    SELECT order_id, offered_price INTO v_order, v_offered FROM public.ride_offers WHERE id = NEW.ride_request_id;
    IF v_order IS NOT NULL AND NEW.proposed_price IS DISTINCT FROM v_offered THEN
        RAISE EXCEPTION 'O frete desta entrega é fixo (R$ %): aceite o valor oferecido', v_offered USING ERRCODE = '42501';
    END IF;
    -- Capacidade: entrega de loja só cabe se o motorista ainda tem espaço na mochila (serializa as candidaturas do mesmo motorista)
    IF v_order IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('delivery_capacity:' || NEW.applicant_id::text));
        SELECT count(*) INTO v_active FROM public.ride_requests WHERE driver_id = NEW.applicant_id AND order_id IS NOT NULL AND status = 'accepted';
        SELECT COALESCE(max(delivery_capacity), 1) INTO v_cap FROM public.driver_vehicles WHERE driver_id = NEW.applicant_id;
        IF v_active >= v_cap THEN
            RAISE EXCEPTION 'Sua mochila está cheia: você já está com % entrega(s) e a sua capacidade é %', v_active, v_cap USING ERRCODE = '42501', HINT = 'delivery_capacity_full';
        END IF;
        -- ... e em VOLUME: soma das unidades das entregas que já leva + esta ≤ o que ele diz que cabe (se informou)
        SELECT max(delivery_capacity_units) INTO v_cap_units FROM public.driver_vehicles WHERE driver_id = NEW.applicant_id;
        IF v_cap_units IS NOT NULL THEN
            SELECT COALESCE(sum(delivery_units), 0) INTO v_units FROM public.ride_requests WHERE driver_id = NEW.applicant_id AND order_id IS NOT NULL AND status = 'accepted';
            SELECT COALESCE(delivery_units, 1) INTO v_new_units FROM public.ride_offers WHERE id = NEW.ride_request_id;
            IF v_units + v_new_units > v_cap_units THEN
                RAISE EXCEPTION 'Não cabe na sua mochila: você já leva % unidade(s), esta tem % e você informou caber %', v_units, v_new_units, v_cap_units USING ERRCODE = '42501', HINT = 'delivery_capacity_units_full';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------- código de retirada
CREATE TABLE IF NOT EXISTS public.delivery_pickup_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    code text NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
    used_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_pickup_codes_active ON public.delivery_pickup_codes (store_id, driver_id) WHERE used_at IS NULL;
ALTER TABLE public.delivery_pickup_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_pickup_codes FROM anon, authenticated;   -- sem política e sem grant: só as funções abaixo (SECURITY DEFINER) leem e escrevem

-- Ao CHEGAR na loja (driver_arrived_at) o banco garante um código ativo para (loja, motorista)
CREATE OR REPLACE FUNCTION public.ensure_pickup_code() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.order_id IS NULL OR NEW.store_id IS NULL OR NEW.driver_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.driver_arrived_at IS NOT NULL AND OLD.driver_arrived_at IS NULL AND NEW.ride_started_at IS NULL THEN
        DELETE FROM public.delivery_pickup_codes WHERE store_id = NEW.store_id AND driver_id = NEW.driver_id AND used_at IS NULL AND expires_at < now();
        INSERT INTO public.delivery_pickup_codes (store_id, driver_id, code)
        VALUES (NEW.store_id, NEW.driver_id, lpad(floor(random() * 10000)::int::text, 4, '0'))
        ON CONFLICT (store_id, driver_id) WHERE used_at IS NULL DO UPDATE SET expires_at = greatest(public.delivery_pickup_codes.expires_at, now() + interval '30 minutes');
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ride_requests_pickup_code ON public.ride_requests;
CREATE TRIGGER ride_requests_pickup_code AFTER UPDATE OF driver_arrived_at ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION public.ensure_pickup_code();

-- A LOJA enxerga os códigos dos motoristas que estão chegando para retirar (só o dono)
CREATE OR REPLACE FUNCTION public.get_store_pickup_codes(p_store uuid)
RETURNS TABLE (driver_id uuid, driver_name text, driver_slug text, driver_avatar text, vehicle text, plate text, code text, expires_at timestamptz, rides integer, ready integer, units numeric, items integer, locked boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store AND s.owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Só o dono da loja vê os códigos de retirada' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT c.driver_id, p.name, p."profileSlug", p.avatar_url,
           (SELECT concat_ws(' · ', v.vehicle_kind, v.car_model) FROM public.driver_vehicles v WHERE v.driver_id = c.driver_id ORDER BY v.delivery_capacity DESC NULLS LAST LIMIT 1),
           (SELECT v.car_plate FROM public.driver_vehicles v WHERE v.driver_id = c.driver_id ORDER BY v.delivery_capacity DESC NULLS LAST LIMIT 1),
           c.code, c.expires_at,
           count(r.id)::int, count(r.id) FILTER (WHERE o.status = 'ready')::int, COALESCE(sum(r.delivery_units), 0), COALESCE(sum(r.items_count), 0)::int,
           (c.locked_until IS NOT NULL AND c.locked_until > now())
      FROM public.delivery_pickup_codes c
      JOIN public.profiles p ON p.id = c.driver_id
      JOIN public.ride_requests r ON r.store_id = c.store_id AND r.driver_id = c.driver_id AND r.status = 'accepted' AND r.order_id IS NOT NULL AND r.driver_arrived_at IS NOT NULL AND r.ride_started_at IS NULL
      JOIN public.orders o ON o.id = r.order_id
     WHERE c.store_id = p_store AND c.used_at IS NULL AND c.expires_at > now()
     GROUP BY c.driver_id, p.name, p."profileSlug", p.avatar_url, c.code, c.expires_at, c.locked_until;
END $$;
REVOKE ALL ON FUNCTION public.get_store_pickup_codes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_pickup_codes(uuid) TO authenticated;

-- O MOTORISTA confirma a retirada com o código: todos os pedidos da saída de uma vez (devem estar PRONTOS).
-- Código errado/travado NÃO levanta exceção: devolve {ok:false,...} para a tentativa errada ficar gravada (uma exceção desfaria o contador de tentativas).
DROP FUNCTION IF EXISTS public.confirm_pickup(uuid[], text);
CREATE OR REPLACE FUNCTION public.confirm_pickup(p_rides uuid[], p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    uid uuid := auth.uid();
    v_store uuid;
    n int; stores_n int; not_ready int; c public.delivery_pickup_codes; v_left int;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta' USING ERRCODE = '42501'; END IF;
    IF p_rides IS NULL OR array_length(p_rides, 1) IS NULL THEN RAISE EXCEPTION 'Nenhuma entrega informada' USING ERRCODE = '22023'; END IF;
    SELECT count(*), count(DISTINCT r.store_id), min(r.store_id::text)::uuid INTO n, stores_n, v_store
      FROM public.ride_requests r WHERE r.id = ANY(p_rides) AND r.driver_id = uid AND r.status = 'accepted' AND r.order_id IS NOT NULL AND r.ride_started_at IS NULL AND r.driver_arrived_at IS NOT NULL;
    IF n <> array_length(p_rides, 1) OR stores_n <> 1 THEN
        RAISE EXCEPTION 'Estas entregas não podem ser retiradas agora (confira se você chegou na loja e se são da mesma loja)' USING ERRCODE = '42501', HINT = 'pickup_invalid';
    END IF;
    SELECT count(*) INTO not_ready FROM public.ride_requests r JOIN public.orders o ON o.id = r.order_id WHERE r.id = ANY(p_rides) AND o.status <> 'ready';
    IF not_ready > 0 THEN
        RAISE EXCEPTION 'Ainda tem % pedido(s) em preparo: espere a loja marcar como pronto', not_ready USING ERRCODE = '42501', HINT = 'order_not_ready';
    END IF;
    SELECT * INTO c FROM public.delivery_pickup_codes WHERE store_id = v_store AND driver_id = uid AND used_at IS NULL FOR UPDATE;
    IF NOT FOUND OR c.expires_at < now() THEN
        RAISE EXCEPTION 'O código venceu: toque em "Cheguei na loja" de novo para gerar outro' USING ERRCODE = '42501', HINT = 'code_expired';
    END IF;
    IF c.locked_until IS NOT NULL AND c.locked_until > now() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'code_locked', 'retry_in_s', ceil(extract(epoch FROM c.locked_until - now()))::int);
    END IF;
    IF c.code IS DISTINCT FROM btrim(COALESCE(p_code, '')) THEN
        v_left := 5 - (c.attempts + 1);
        UPDATE public.delivery_pickup_codes SET attempts = attempts + 1, locked_until = CASE WHEN attempts + 1 >= 5 THEN now() + interval '5 minutes' ELSE NULL END WHERE id = c.id;
        RETURN jsonb_build_object('ok', false, 'error', CASE WHEN v_left <= 0 THEN 'code_locked' ELSE 'wrong_code' END, 'attempts_left', greatest(v_left, 0), 'retry_in_s', CASE WHEN v_left <= 0 THEN 300 ELSE NULL END);
    END IF;
    UPDATE public.delivery_pickup_codes SET used_at = now() WHERE id = c.id;
    UPDATE public.ride_requests SET ride_started_at = now() WHERE id = ANY(p_rides);
    RETURN jsonb_build_object('ok', true, 'started', n);
END $$;
REVOKE ALL ON FUNCTION public.confirm_pickup(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_pickup(uuid[], text) TO authenticated;

-- ---------------------------------------------------------------- painel da loja: entregadores e saídas
CREATE OR REPLACE FUNCTION public.get_store_delivery_board(p_store uuid, p_minutes integer DEFAULT 60) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    s public.stores;
    v_min integer := least(greatest(COALESCE(p_minutes, 60), 15), 360);
    v_drivers jsonb; v_hourly jsonb; v_out int; v_done int; v_wait int; v_near int;
BEGIN
    SELECT * INTO s FROM public.stores WHERE id = p_store AND owner_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Só o dono da loja vê o painel de entregas' USING ERRCODE = '42501'; END IF;

    SELECT COALESCE(jsonb_agg(d ORDER BY d.phase_rank, d.name), '[]'::jsonb) INTO v_drivers FROM (
        SELECT p.id AS driver_id, p.name, p."profileSlug" AS slug, p.avatar_url AS avatar,
               (SELECT concat_ws(' · ', v.vehicle_kind, v.car_model) FROM public.driver_vehicles v WHERE v.driver_id = p.id ORDER BY v.delivery_capacity DESC NULLS LAST LIMIT 1) AS vehicle,
               count(*)::int AS rides, COALESCE(sum(r.delivery_units), 0) AS units, COALESCE(sum(r.items_count), 0)::int AS items,
               (SELECT max(v.delivery_capacity) FROM public.driver_vehicles v WHERE v.driver_id = p.id) AS capacity,
               (SELECT max(v.delivery_capacity_units) FROM public.driver_vehicles v WHERE v.driver_id = p.id) AS capacity_units,
               CASE WHEN bool_or(r.ride_started_at IS NOT NULL) THEN 'delivering' WHEN bool_or(r.driver_arrived_at IS NOT NULL) THEN 'at_store' WHEN bool_or(r.driver_en_route) THEN 'to_store' ELSE 'accepted' END AS phase,
               CASE WHEN bool_or(r.ride_started_at IS NOT NULL) THEN 4 WHEN bool_or(r.driver_arrived_at IS NOT NULL) THEN 1 WHEN bool_or(r.driver_en_route) THEN 2 ELSE 3 END AS phase_rank,
               count(*) FILTER (WHERE o.status = 'ready')::int AS ready
          FROM public.ride_requests r JOIN public.profiles p ON p.id = r.driver_id JOIN public.orders o ON o.id = r.order_id
         WHERE r.store_id = p_store AND r.status = 'accepted' AND r.order_id IS NOT NULL
         GROUP BY p.id, p.name, p."profileSlug", p.avatar_url
    ) d;

    SELECT count(*) INTO v_out FROM public.ride_requests r WHERE r.store_id = p_store AND r.order_id IS NOT NULL AND r.ride_started_at > now() - make_interval(mins => v_min);
    SELECT count(*) INTO v_done FROM public.ride_requests r WHERE r.store_id = p_store AND r.order_id IS NOT NULL AND r.status = 'completed' AND r.ride_started_at > now() - make_interval(mins => v_min);
    SELECT count(*) INTO v_wait FROM public.ride_requests r JOIN public.orders o ON o.id = r.order_id WHERE r.store_id = p_store AND r.status = 'pending' AND o.status IN ('preparing', 'ready');
    SELECT count(*) INTO v_near FROM public.driver_pricing dp JOIN public.profiles pr ON pr.id = dp.driver_id
     WHERE dp.driver_mode_active AND dp.live_location_sync AND dp.live_updated_at > now() - interval '10 minutes' AND COALESCE(pr.is_blocked, false) = false
       AND s.store_lat IS NOT NULL AND dp.live_lat IS NOT NULL
       AND (6371 * 2 * asin(least(1, sqrt(power(sin(radians(dp.live_lat - s.store_lat) / 2), 2) + cos(radians(s.store_lat)) * cos(radians(dp.live_lat)) * power(sin(radians(dp.live_lng - s.store_lng) / 2), 2))))) <= 6;

    -- saídas por faixa de 30 min nas últimas 3 horas
    SELECT COALESCE(jsonb_agg(jsonb_build_object('from', b.t, 'out', b.n) ORDER BY b.t), '[]'::jsonb) INTO v_hourly FROM (
        SELECT g.t, (SELECT count(*) FROM public.ride_requests r WHERE r.store_id = p_store AND r.order_id IS NOT NULL AND r.ride_started_at >= g.t AND r.ride_started_at < g.t + interval '30 minutes') AS n
          FROM generate_series(date_trunc('hour', now()) - interval '2 hours' + CASE WHEN extract(minute FROM now()) >= 30 THEN interval '30 minutes' ELSE interval '0' END, now(), interval '30 minutes') g(t)
    ) b;

    RETURN jsonb_build_object('minutes', v_min, 'drivers', v_drivers, 'out_in_period', v_out, 'delivered_in_period', v_done, 'waiting_for_driver', v_wait, 'drivers_nearby', v_near, 'hourly', v_hourly);
END $$;
REVOKE ALL ON FUNCTION public.get_store_delivery_board(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_delivery_board(uuid, integer) TO authenticated;
