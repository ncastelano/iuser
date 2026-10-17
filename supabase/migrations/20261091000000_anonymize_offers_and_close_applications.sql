-- Etapa 1.6 — itens 1 e 2.
--
-- (1) ANONIMIZAR O PASSAGEIRO ANTES DO ACEITE. ride_offers ainda carregava o primeiro nome do cliente em corridas pessoais
--     (requester_first_name). Não há necessidade operacional: a coluna sai da tabela e da função de sincronização, então o
--     dado deixa de existir na projeção que o motorista (e o realtime) recebe. Depois do aceite o motorista lê a corrida
--     completa em ride_requests (policy "Motorista vê a corrida que aceitou"), como antes.
--
-- (2) CANDIDATURAS PERDEDORAS. Ao escolher motorista (RPC select_ride_driver) as demais já viravam 'rejected', mas no aceite
--     automático de entrega de loja e em qualquer outro caminho as perdedoras ficavam 'pending' para sempre. Agora um gatilho
--     na própria transição da corrida (atômico, na mesma transação do aceite) rejeita tudo que sobrou pendente:
--       * corrida pendente -> aceita/concluída/cancelada: as candidaturas pendentes (menos a do motorista vencedor) viram 'rejected';
--       * candidatura que chega DEPOIS da corrida fechada (corrida de aceite concorrente) nasce já 'rejected'.
--     A proteção contra aceite duplo (UPDATE condicional em status='pending' + índice de uma corrida ativa por pedido)
--     não é tocada: o gatilho só roda depois que a transição já aconteceu.

ALTER TABLE public.ride_offers DROP COLUMN IF EXISTS requester_first_name;

CREATE OR REPLACE FUNCTION public.sync_ride_offer()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
        CASE WHEN r.order_id IS NOT NULL THEN r.origin_address ELSE COALESCE(public._address_area(r.origin_address), 'Região aproximada') END,
        COALESCE(public._address_area(r.destination_address), 'Região aproximada'),
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
        CASE WHEN r.stop1_address IS NULL THEN NULL ELSE COALESCE(public._address_area(r.stop1_address), 'Região aproximada') END,
        r.stop1_complement,
        round(r.stop1_lat::numeric, 2)::double precision,
        round(r.stop1_lng::numeric, 2)::double precision,
        CASE WHEN r.stop2_address IS NULL THEN NULL ELSE COALESCE(public._address_area(r.stop2_address), 'Região aproximada') END,
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
$$;
REVOKE ALL ON FUNCTION public.sync_ride_offer() FROM PUBLIC, anon, authenticated;

-- ===== candidaturas perdedoras =====
CREATE OR REPLACE FUNCTION public.reject_losing_ride_applications()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    UPDATE public.ride_applications
       SET status = 'rejected'
     WHERE ride_request_id = NEW.id
       AND status = 'pending'
       AND applicant_id IS DISTINCT FROM NEW.driver_id;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_losing_ride_applications() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ride_requests_reject_losing_applications ON public.ride_requests;
CREATE TRIGGER ride_requests_reject_losing_applications
    AFTER UPDATE OF status ON public.ride_requests
    FOR EACH ROW
    WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending')
    EXECUTE FUNCTION public.reject_losing_ride_applications();

-- Candidatura que entra com a corrida já fechada (perdeu a corrida de aceite) nasce rejeitada.
-- (Roda depois do aceite automático: o nome começa com "zz" para ficar por último entre os AFTER INSERT.)
CREATE OR REPLACE FUNCTION public.reject_application_on_closed_ride()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_status text;
    v_driver uuid;
BEGIN
    SELECT status, driver_id INTO v_status, v_driver FROM public.ride_requests WHERE id = NEW.ride_request_id;
    IF v_status IS NOT NULL AND v_status <> 'pending' THEN
        UPDATE public.ride_applications SET status = 'rejected'
         WHERE id = NEW.id AND status = 'pending' AND applicant_id IS DISTINCT FROM v_driver;
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_application_on_closed_ride() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_ride_applications_reject_if_closed ON public.ride_applications;
CREATE TRIGGER zz_ride_applications_reject_if_closed
    AFTER INSERT ON public.ride_applications
    FOR EACH ROW EXECUTE FUNCTION public.reject_application_on_closed_ride();

-- Limpeza das inconsistências já existentes (candidaturas 'pending' em corridas que já não estão pendentes):
-- a do motorista da corrida aceita/concluída passa a 'accepted'; as demais, 'rejected'.
UPDATE public.ride_applications a SET status = 'accepted'
  FROM public.ride_requests r
 WHERE r.id = a.ride_request_id AND a.status = 'pending' AND r.status IN ('accepted', 'completed') AND a.applicant_id = r.driver_id;
UPDATE public.ride_applications a SET status = 'rejected'
  FROM public.ride_requests r
 WHERE r.id = a.ride_request_id AND a.status = 'pending' AND r.status <> 'pending';
