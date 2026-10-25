-- Motoristas no /radar (migration 20261120): privacidade e regras. Roda inteiro numa transação DESFEITA (termina em RAISE EXCEPTION 'RESULT: ...').
-- Usa duas contas já existentes: o PRIMEIRO motorista com veículo (vira o "motorista de teste") e qualquer outro perfil (o "cliente").
--   Local:   python3 -c "..." (ver scripts/local/_common.py: sql_file_local)   |   Staging: db query --workdir .staging -f <este arquivo>
DO $T$
DECLARE
    cli uuid; mot uuid; r text := ''; n int; rec record; passes int := 0; fails int := 0; cols text;
    lat0 constant double precision := -8.7612; lng0 constant double precision := -63.9004;
BEGIN
    SELECT dv.driver_id INTO mot FROM public.driver_vehicles dv WHERE dv.vehicle_slug IS NOT NULL ORDER BY dv.updated_at DESC NULLS LAST LIMIT 1;
    SELECT p.id INTO cli FROM public.profiles p WHERE p.id <> mot AND COALESCE(p.is_blocked, false) = false LIMIT 1;
    IF cli IS NULL OR mot IS NULL THEN RAISE EXCEPTION 'RESULT: FAIL setup (precisa de um motorista com veículo e outro perfil)'; END IF;

    INSERT INTO public.driver_pricing (driver_id, pricing_mode, driver_mode_active, live_location_sync, live_lat, live_lng, live_updated_at)
    VALUES (mot, 'platform', true, true, lat0 + 0.0011, lng0 + 0.0013, now())
    ON CONFLICT (driver_id) DO UPDATE SET driver_mode_active = true, live_location_sync = true, live_lat = lat0 + 0.0011, live_lng = lng0 + 0.0013, live_updated_at = now();

    -- 0) nenhuma coluna de placa/endereço/posição exata no retorno
    SELECT pg_get_function_result('public.get_radar_drivers(double precision,double precision,double precision)'::regprocedure) INTO cols;
    IF cols NOT LIKE '%plate%' AND cols NOT LIKE '%address%' AND cols NOT LIKE '%live_%' THEN passes := passes + 1; ELSE r := r || 'FAIL colunas de retorno: ' || cols || E'\n'; fails := fails + 1; END IF;

    -- 1) anônimo NÃO executa (pelo catálogo) e logado executa
    IF NOT has_function_privilege('anon', 'public.get_radar_drivers(double precision,double precision,double precision)', 'execute') THEN passes := passes + 1; ELSE r := r || E'FAIL anon pode executar\n'; fails := fails + 1; END IF;
    IF has_function_privilege('authenticated', 'public.get_radar_drivers(double precision,double precision,double precision)', 'execute') THEN passes := passes + 1; ELSE r := r || E'FAIL authenticated não pode executar\n'; fails := fails + 1; END IF;

    -- 2) cliente logado vê o motorista, posição ENCAIXADA na grade (não a exata) e o próprio motorista não se vê
    PERFORM set_config('request.jwt.claims', json_build_object('sub', cli, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT * INTO rec FROM public.get_radar_drivers(lat0, lng0, 30) WHERE driver_id = mot;
    IF rec.driver_id IS NOT NULL THEN passes := passes + 1; ELSE r := r || E'FAIL cliente não vê o motorista ativo\n'; fails := fails + 1; END IF;
    IF abs(rec.lat / 0.003 - round(rec.lat / 0.003)) < 1e-6 AND abs(rec.lng / 0.003 - round(rec.lng / 0.003)) < 1e-6 THEN passes := passes + 1; ELSE r := r || E'FAIL posição fora da grade\n'; fails := fails + 1; END IF;
    IF rec.lat <> lat0 + 0.0011 AND rec.lng <> lng0 + 0.0013 THEN passes := passes + 1; ELSE r := r || E'FAIL devolveu a posição exata\n'; fails := fails + 1; END IF;
    SELECT count(*) INTO n FROM public.get_radar_drivers(lat0 + 1.0, lng0, 5) WHERE driver_id = mot;
    IF n = 0 THEN passes := passes + 1; ELSE r := r || E'FAIL aparece fora do raio\n'; fails := fails + 1; END IF;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', mot, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.get_radar_drivers(lat0, lng0, 30) WHERE driver_id = mot;
    IF n = 0 THEN passes := passes + 1; ELSE r := r || E'FAIL o motorista se vê no radar\n'; fails := fails + 1; END IF;
    RESET ROLE;

    -- 3) posição velha, sincronização desligada e modo desligado: não aparece
    PERFORM set_config('request.jwt.claims', json_build_object('sub', cli, 'role', 'authenticated')::text, true);
    UPDATE public.driver_pricing SET live_updated_at = now() - interval '11 minutes' WHERE driver_id = mot;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.get_radar_drivers(lat0, lng0, 30) WHERE driver_id = mot;
    IF n = 0 THEN passes := passes + 1; ELSE r := r || E'FAIL aparece com posição velha\n'; fails := fails + 1; END IF;
    RESET ROLE;
    UPDATE public.driver_pricing SET live_updated_at = now(), live_location_sync = false WHERE driver_id = mot;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.get_radar_drivers(lat0, lng0, 30) WHERE driver_id = mot;
    IF n = 0 THEN passes := passes + 1; ELSE r := r || E'FAIL aparece com sincronização desligada\n'; fails := fails + 1; END IF;
    RESET ROLE;
    UPDATE public.driver_pricing SET live_location_sync = true, driver_mode_active = false WHERE driver_id = mot;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.get_radar_drivers(lat0, lng0, 30) WHERE driver_id = mot;
    IF n = 0 THEN passes := passes + 1; ELSE r := r || E'FAIL aparece com modo motorista desligado\n'; fails := fails + 1; END IF;
    RESET ROLE;

    RAISE EXCEPTION 'RESULT: % (% ok, % falhas)%', CASE WHEN fails = 0 THEN 'PASS' ELSE 'FAIL' END, passes, fails, E'\n' || r;
END
$T$;
