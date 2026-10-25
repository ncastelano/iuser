-- Motoristas ativos no mapa do /pedir-motorista (interface 3.0): `get_active_drivers_map` devolve, para quem está LOGADO, os motoristas
-- que agora estão disponíveis perto de um ponto: SÓ tipo de veículo (carro/moto/bicicleta), posição APROXIMADA e há quanto tempo foi
-- atualizada. Nunca id, nome, foto, placa nem a posição exata.
--
-- "Ativo" = modo motorista ligado (driver_pricing.driver_mode_active) + sincronização da localização ao vivo ligada
-- (live_location_sync: o próprio motorista autorizou) + posição atualizada nos últimos 10 minutos + conta não bloqueada.
-- Privacidade: a posição é "encaixada" numa grade de ~330 m (0,003°), então o mapa mostra a região onde o motorista está, não a rua nem
-- a casa; o raio máximo é 50 km e o resultado tem no máximo 100 motoristas (não dá para varrer a cidade inteira de uma vez); anônimo
-- não executa; o próprio motorista não aparece para si. A tabela driver_pricing continua privada (a localização exata só vai ao
-- passageiro da corrida aceita, pela policy da migration 20260907080000).
CREATE OR REPLACE FUNCTION public.get_active_drivers_map(
    p_lat double precision,
    p_lng double precision,
    p_radius_km double precision DEFAULT 30
)
RETURNS TABLE (kind text, lat double precision, lng double precision, age_seconds integer)
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
    SELECT d.kind, d.glat, d.glng, d.age
    FROM (
        SELECT
            v.vehicle_kind AS kind,
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
            SELECT dv.vehicle_kind
            FROM public.driver_vehicles dv
            WHERE dv.driver_id = dp.driver_id
            ORDER BY dv.updated_at DESC NULLS LAST
            LIMIT 1
        ) v ON true
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

REVOKE ALL ON FUNCTION public.get_active_drivers_map(double precision, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_drivers_map(double precision, double precision, double precision) TO authenticated;
