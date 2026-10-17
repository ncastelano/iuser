-- Etapa 1.5 / Grupo A — PRIVACIDADE das corridas abertas.
--
-- Problema: qualquer pessoa (inclusive visitante sem login) lia ride_requests com status 'pending':
-- endereço completo, nome/WhatsApp de quem envia e recebe, coordenadas exatas. Corrigido no banco:
--  * (migration 20261086, aplicada DEPOIS que o app novo está no ar) as policies de leitura de corridas
--    pendentes saem de ride_requests, que volta a ser lida só pelo solicitante e pelo motorista que aceitou;
--  * motoristas passam a ver as ofertas em ride_offers: uma PROJEÇÃO sem dados pessoais, mantida por
--    gatilho. Antes do aceite: retirada exata só se for loja (dado público), região/bairro aproximado
--    do destino, coordenadas arredondadas (~1 km), sem nomes, telefones, complementos nem observações;
--  * visitante sem login não lê nada (nem ride_offers).

-- "Bairro, Cidade" a partir de um endereço textual (formatos variados do geocoder): descarta rua/número/CEP/país.
CREATE OR REPLACE FUNCTION public._address_area(p_address text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    s text;
    parts text[];
    seg text;
    picked text[] := '{}';
    i integer;
BEGIN
    IF p_address IS NULL OR btrim(p_address) = '' THEN RETURN NULL; END IF;
    s := regexp_replace(p_address, '^[^,]*[—–]\s*', '');
    parts := string_to_array(s, ',');
    FOR i IN 2 .. COALESCE(array_length(parts, 1), 0) LOOP
        seg := btrim(regexp_replace(parts[i], '\s+[-–]\s+.*$', ''));
        CONTINUE WHEN seg = '' OR seg ~ '^[0-9]' OR seg ~* '^(brasil|brazil|regi[aã]o)';
        picked := picked || seg;
        EXIT WHEN array_length(picked, 1) >= 2;
    END LOOP;
    IF array_length(picked, 1) IS NULL THEN RETURN NULL; END IF;
    RETURN array_to_string(picked, ', ');
END;
$$;

-- Projeção pública (para motoristas logados) das corridas abertas.
CREATE TABLE IF NOT EXISTS public.ride_offers (
    id uuid PRIMARY KEY,
    requester_id uuid,
    ride_type text,
    origin_address text,
    destination_address text,
    notes text,
    status text,
    created_at timestamptz,
    passenger_count integer,
    vehicle_type text,
    origin_needs_access boolean,
    origin_access_notes text,
    destination_needs_access boolean,
    destination_access_notes text,
    has_shopping boolean,
    has_extra_object boolean,
    has_child boolean,
    has_pet boolean,
    object_description text,
    object_is_sensitive boolean,
    object_size text,
    is_grocery_shopping boolean,
    bag_count integer,
    extra_object_description text,
    pet_description text,
    origin_lat double precision,
    origin_lng double precision,
    destination_lat double precision,
    destination_lng double precision,
    distance_km numeric,
    duration_min numeric,
    child_age text,
    child_needs_car_seat boolean,
    scheduled_for timestamptz,
    children_count integer,
    applicant_count integer,
    has_special_needs boolean,
    special_needs_description text,
    extra_object_count integer,
    pet_count integer,
    origin_complement text,
    destination_complement text,
    special_needs_wheelchair boolean,
    special_needs_wheelchair_type text,
    special_needs_visual_impairment boolean,
    has_guide_dog boolean,
    pet_weight_range text,
    pet_has_carrier boolean,
    delivery_location text,
    payment_method text,
    cash_change_for numeric,
    grocery_bag_size text,
    card_is_contactless boolean,
    wants_air_conditioning boolean,
    offered_price numeric,
    order_id uuid,
    store_id uuid,
    stop1_address text,
    stop1_complement text,
    stop1_lat double precision,
    stop1_lng double precision,
    stop2_address text,
    stop2_complement text,
    stop2_lat double precision,
    stop2_lng double precision,
    preferred_driver_id uuid,
    visible_radius_km numeric,
    requester_first_name text
);
CREATE INDEX IF NOT EXISTS ride_offers_created_idx ON public.ride_offers (created_at DESC);

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
    INSERT INTO public.ride_offers (id, requester_id, ride_type, origin_address, destination_address, notes, status, created_at, passenger_count, vehicle_type, origin_needs_access, origin_access_notes, destination_needs_access, destination_access_notes, has_shopping, has_extra_object, has_child, has_pet, object_description, object_is_sensitive, object_size, is_grocery_shopping, bag_count, extra_object_description, pet_description, origin_lat, origin_lng, destination_lat, destination_lng, distance_km, duration_min, child_age, child_needs_car_seat, scheduled_for, children_count, applicant_count, has_special_needs, special_needs_description, extra_object_count, pet_count, origin_complement, destination_complement, special_needs_wheelchair, special_needs_wheelchair_type, special_needs_visual_impairment, has_guide_dog, pet_weight_range, pet_has_carrier, delivery_location, payment_method, cash_change_for, grocery_bag_size, card_is_contactless, wants_air_conditioning, offered_price, order_id, store_id, stop1_address, stop1_complement, stop1_lat, stop1_lng, stop2_address, stop2_complement, stop2_lat, stop2_lng, preferred_driver_id, visible_radius_km, requester_first_name)
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
        r.visible_radius_km,
        CASE WHEN r.order_id IS NULL THEN NULLIF(split_part(btrim(COALESCE((SELECT name FROM public.profiles WHERE id = r.requester_id), '')), ' ', 1), '') ELSE NULL END
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
        requester_first_name = EXCLUDED.requester_first_name;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_ride_offer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ride_requests_sync_offer ON public.ride_requests;
CREATE TRIGGER ride_requests_sync_offer
    AFTER INSERT OR UPDATE OR DELETE ON public.ride_requests
    FOR EACH ROW EXECUTE FUNCTION public.sync_ride_offer();

-- Backfill das corridas pendentes de hoje
UPDATE public.ride_requests SET id = id WHERE status = 'pending';

ALTER TABLE public.ride_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ride_offers_select ON public.ride_offers;
-- Logado vê as ofertas dos outros (nunca as próprias).
CREATE POLICY ride_offers_select ON public.ride_offers FOR SELECT TO authenticated
    USING (NOT EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.id = ride_offers.id AND r.requester_id = auth.uid()));
REVOKE ALL ON public.ride_offers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ride_offers TO authenticated;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_offers;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;

-- A candidatura checava a corrida lendo ride_requests (que o motorista não lê mais): vira função.
CREATE OR REPLACE FUNCTION public.can_apply_to_ride(p_ride uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.ride_requests rr
        WHERE rr.id = p_ride AND rr.status = 'pending' AND rr.requester_id <> auth.uid() AND rr.applicant_count < 5
    )
$$;
REVOKE ALL ON FUNCTION public.can_apply_to_ride(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_apply_to_ride(uuid) TO authenticated;

DROP POLICY IF EXISTS "Candidato se candidata a pedido de motorista de outra pessoa" ON public.ride_applications;
CREATE POLICY "Candidato se candidata a pedido de motorista de outra pessoa" ON public.ride_applications FOR INSERT
    WITH CHECK (
        auth.uid() = applicant_id
        AND public.can_apply_to_ride(ride_request_id)
        AND (SELECT has_driver FROM public.get_active_plan_grants(auth.uid()))
        AND public.get_driver_postpaid_debt(auth.uid()) < 50
    );
