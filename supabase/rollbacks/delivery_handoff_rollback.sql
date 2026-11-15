-- Rollback de 20261130000003_delivery_handoff.sql (volume, capacidade em unidades, código de retirada, painel de entregas da loja)
DROP FUNCTION IF EXISTS public.get_store_delivery_board(uuid, integer);
DROP FUNCTION IF EXISTS public.confirm_pickup(uuid[], text);
DROP FUNCTION IF EXISTS public.get_store_pickup_codes(uuid);
DROP TRIGGER IF EXISTS ride_requests_pickup_code ON public.ride_requests;
DROP FUNCTION IF EXISTS public.ensure_pickup_code();
DROP TABLE IF EXISTS public.delivery_pickup_codes;
DROP TRIGGER IF EXISTS ride_requests_set_units ON public.ride_requests;
DROP FUNCTION IF EXISTS public.set_ride_delivery_units();

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
    END IF;
    RETURN NEW;
END;
$function$;

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
    INSERT INTO public.ride_offers (id, requester_id, ride_type, origin_address, destination_address, notes, status, created_at, passenger_count, vehicle_type, origin_needs_access, origin_access_notes, destination_needs_access, destination_access_notes, has_shopping, has_extra_object, has_child, has_pet, object_description, object_is_sensitive, object_size, is_grocery_shopping, bag_count, extra_object_description, pet_description, origin_lat, origin_lng, destination_lat, destination_lng, distance_km, duration_min, child_age, child_needs_car_seat, scheduled_for, children_count, applicant_count, has_special_needs, special_needs_description, extra_object_count, pet_count, origin_complement, destination_complement, special_needs_wheelchair, special_needs_wheelchair_type, special_needs_visual_impairment, has_guide_dog, pet_weight_range, pet_has_carrier, delivery_location, payment_method, cash_change_for, grocery_bag_size, card_is_contactless, wants_air_conditioning, offered_price, order_id, store_id, stop1_address, stop1_complement, stop1_lat, stop1_lng, stop2_address, stop2_complement, stop2_lat, stop2_lng, preferred_driver_id, visible_radius_km)
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
        r.visible_radius_km
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
        visible_radius_km = EXCLUDED.visible_radius_km;
    RETURN NEW;
END;
$function$;

ALTER TABLE public.driver_vehicles DROP COLUMN IF EXISTS delivery_capacity_units;
ALTER TABLE public.ride_offers DROP COLUMN IF EXISTS delivery_units, DROP COLUMN IF EXISTS items_count;
ALTER TABLE public.ride_requests DROP COLUMN IF EXISTS delivery_units, DROP COLUMN IF EXISTS items_count;
ALTER TABLE public.products DROP COLUMN IF EXISTS delivery_units;
