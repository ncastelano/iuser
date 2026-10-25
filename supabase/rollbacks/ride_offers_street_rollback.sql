-- Volta as ofertas de corrida a mostrar só o bairro (função anterior, com _address_area).
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
$function$;

UPDATE public.ride_offers o SET
    origin_address = CASE WHEN r.order_id IS NOT NULL THEN o.origin_address ELSE COALESCE(public._address_area(r.origin_address), 'Região aproximada') END,
    destination_address = COALESCE(public._address_area(r.destination_address), 'Região aproximada'),
    stop1_address = CASE WHEN r.stop1_address IS NULL THEN NULL ELSE COALESCE(public._address_area(r.stop1_address), 'Região aproximada') END,
    stop2_address = CASE WHEN r.stop2_address IS NULL THEN NULL ELSE COALESCE(public._address_area(r.stop2_address), 'Região aproximada') END
FROM public.ride_requests r
WHERE r.id = o.id;

DROP FUNCTION IF EXISTS public._offer_place(text);
