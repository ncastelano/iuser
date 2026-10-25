-- Motoristas no /radar: `get_radar_drivers` devolve, para quem está LOGADO, os motoristas que agora estão disponíveis perto de um ponto, com o
-- que a página pública do veículo (iuser.com.br/<vehicleSlug>) já mostra ao cliente: quem é, o veículo (foto, modelo, lugares, comodidades), os
-- números (corridas feitas, nota, avaliações, desde quando) e a tarifa PRÓPRIA do motorista (pra "a partir de" e os exemplos de preço).
--
-- "Disponível" = o mesmo critério do mapa do /pedir-motorista (get_active_drivers_map): modo motorista ligado + sincronização da localização
-- ligada + posição atualizada nos últimos 10 minutos + conta não bloqueada. A posição sai ENCAIXADA numa grade de ~330 m (nunca a exata); raio
-- máximo 50 km; no máximo 100 motoristas; anônimo não executa; o próprio motorista não aparece pra si. Um motorista = um marcador: vale o veículo
-- mexido por último. Não devolve placa nem endereço. A tabela driver_pricing continua privada: só os campos de preço do motorista saem daqui.
CREATE OR REPLACE FUNCTION public.get_radar_drivers(
    p_lat double precision,
    p_lng double precision,
    p_radius_km double precision DEFAULT 30
)
RETURNS TABLE (
    driver_id uuid, vehicle_slug text, vehicle_kind text, car_model text, car_color text, car_photo_url text,
    passenger_capacity integer, has_baby_seat boolean, services text[],
    trunk_bags_pequena integer, trunk_bags_media integer, trunk_bags_grande integer,
    trunk_suitcases_pequena integer, trunk_suitcases_media integer, trunk_suitcases_grande integer,
    name text, profile_slug text, avatar_url text,
    rides_completed bigint, rating_avg numeric, rating_count bigint, member_since timestamptz,
    pricing_mode text, base_distance_km numeric, base_fee numeric, price_per_km_after_base numeric,
    lat double precision, lng double precision, age_seconds integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_r double precision;
    c_step constant double precision := 0.003;      -- grade de ~330 m
    c_fresh constant interval := interval '10 minutes';
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'login_required' USING ERRCODE = '28000';
    END IF;
    IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
        RAISE EXCEPTION 'invalid_position' USING ERRCODE = '22023';
    END IF;
    v_r := LEAST(GREATEST(COALESCE(p_radius_km, 30), 1), 50);

    RETURN QUERY
    SELECT d.driver_id, d.vehicle_slug, d.vehicle_kind, d.car_model, d.car_color, d.car_photo_url,
           d.passenger_capacity, d.has_baby_seat, d.services,
           d.trunk_bags_pequena, d.trunk_bags_media, d.trunk_bags_grande,
           d.trunk_suitcases_pequena, d.trunk_suitcases_media, d.trunk_suitcases_grande,
           d.name, d.profile_slug, d.avatar_url,
           d.rides_completed, d.rating_avg, d.rating_count, d.member_since,
           d.pricing_mode, d.base_distance_km, d.base_fee, d.price_per_km_after_base,
           d.glat, d.glng, d.age
    FROM (
        SELECT
            dp.driver_id AS driver_id,
            v.vehicle_slug AS vehicle_slug, v.vehicle_kind AS vehicle_kind, v.car_model AS car_model, v.car_color AS car_color,
            v.car_photo_url AS car_photo_url, v.passenger_capacity AS passenger_capacity, v.has_baby_seat AS has_baby_seat, v.services AS services,
            v.trunk_bags_pequena AS trunk_bags_pequena, v.trunk_bags_media AS trunk_bags_media, v.trunk_bags_grande AS trunk_bags_grande,
            v.trunk_suitcases_pequena AS trunk_suitcases_pequena, v.trunk_suitcases_media AS trunk_suitcases_media, v.trunk_suitcases_grande AS trunk_suitcases_grande,
            pr.name AS name, pr."profileSlug" AS profile_slug, pr.avatar_url AS avatar_url,
            st.rides_completed AS rides_completed, st.rating_avg AS rating_avg, st.rating_count AS rating_count, st.member_since AS member_since,
            dp.pricing_mode AS pricing_mode, dp.base_distance_km AS base_distance_km, dp.base_fee AS base_fee, dp.price_per_km_after_base AS price_per_km_after_base,
            round(dp.live_lat / c_step) * c_step AS glat,
            round(dp.live_lng / c_step) * c_step AS glng,
            EXTRACT(EPOCH FROM (now() - dp.live_updated_at))::integer AS age,
            -- distância (km) até o ponto pedido, pela posição real (só para filtrar/ordenar; não sai da função)
            6371 * 2 * asin(sqrt(
                power(sin(radians(dp.live_lat - p_lat) / 2), 2)
                + cos(radians(p_lat)) * cos(radians(dp.live_lat)) * power(sin(radians(dp.live_lng - p_lng) / 2), 2)
            )) AS dist_km
        FROM public.driver_pricing dp
        JOIN public.profiles pr ON pr.id = dp.driver_id
        JOIN LATERAL (
            SELECT dv.vehicle_slug, dv.vehicle_kind, dv.car_model, dv.car_color, dv.car_photo_url, dv.passenger_capacity, dv.has_baby_seat, dv.services,
                   dv.trunk_bags_pequena, dv.trunk_bags_media, dv.trunk_bags_grande,
                   dv.trunk_suitcases_pequena, dv.trunk_suitcases_media, dv.trunk_suitcases_grande
            FROM public.driver_vehicles dv
            WHERE dv.driver_id = dp.driver_id AND dv.vehicle_slug IS NOT NULL
            ORDER BY dv.updated_at DESC NULLS LAST
            LIMIT 1
        ) v ON true
        LEFT JOIN LATERAL (SELECT * FROM public.get_driver_public_stats(dp.driver_id)) st ON true
        WHERE dp.driver_mode_active
          AND dp.live_location_sync
          AND dp.live_lat IS NOT NULL AND dp.live_lng IS NOT NULL
          AND dp.live_updated_at > now() - c_fresh
          AND dp.driver_id <> v_uid
          AND COALESCE(pr.is_blocked, false) = false
    ) d
    WHERE d.dist_km <= v_r
    ORDER BY d.dist_km
    LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.get_radar_drivers(double precision, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_radar_drivers(double precision, double precision, double precision) TO authenticated;
