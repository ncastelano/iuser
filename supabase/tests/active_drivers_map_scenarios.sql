-- Motoristas ativos no mapa (migration 20261108): privacidade e regras. Roda inteiro numa transação DESFEITA (termina em RAISE EXCEPTION
-- 'RESULT: ...'). Usa as contas do seed do STAGING (scripts/staging/seed.mjs): cliente@ pede, motorista@ é o motorista.
--   env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked --workdir .staging -f "$PWD/supabase/tests/active_drivers_map_scenarios.sql"
DO $T$
DECLARE
    cli uuid; mot uuid; r text := ''; n int; rec record; passes int := 0; fails int := 0;
    lat0 constant double precision := -8.7612; lng0 constant double precision := -63.9004;
    cols text;
BEGIN
    SELECT id INTO cli FROM public.profiles WHERE email = 'cliente@staging.iuser.test';
    SELECT id INTO mot FROM public.profiles WHERE email = 'motorista@staging.iuser.test';
    IF cli IS NULL OR mot IS NULL THEN RAISE EXCEPTION 'RESULT: FAIL setup (rode scripts/staging/seed.mjs)'; END IF;

    -- cenário base: motorista ativo, com localização ao vivo recente (posição "exata" propositalmente fora da grade)
    INSERT INTO public.driver_pricing (driver_id, pricing_mode, driver_mode_active, live_location_sync, live_lat, live_lng, live_updated_at)
    VALUES (mot, 'platform', true, true, lat0 + 0.0011, lng0 + 0.0013, now())
    ON CONFLICT (driver_id) DO UPDATE SET driver_mode_active = true, live_location_sync = true, live_lat = lat0 + 0.0011, live_lng = lng0 + 0.0013, live_updated_at = now();
    INSERT INTO public.driver_vehicles (driver_id, vehicle_kind) VALUES (mot, 'moto') ON CONFLICT (driver_id, vehicle_kind) DO NOTHING;

    -- 0) a função só devolve tipo, posição aproximada e idade (nenhuma coluna de identidade)
    SELECT pg_get_function_result('public.get_active_drivers_map(double precision,double precision,double precision)'::regprocedure) INTO cols;
    IF cols = 'TABLE(kind text, lat double precision, lng double precision, age_seconds integer)' THEN passes := passes + 1; ELSE r := r || 'FAIL colunas de retorno: ' || cols || E'\n'; fails := fails + 1; END IF;

    -- 1) anônimo NÃO executa
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;
    BEGIN PERFORM * FROM public.get_active_drivers_map(lat0, lng0, 30); r := r || E'FAIL anon executou\n'; fails := fails + 1;
    EXCEPTION WHEN insufficient_privilege THEN passes := passes + 1; END;
    RESET ROLE;

    -- 2) cliente logado vê o motorista, tipo certo e posição ENCAIXADA na grade (não a exata)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', cli, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT * INTO rec FROM public.get_active_drivers_map(lat0, lng0, 30) LIMIT 1;
    IF rec.kind = 'moto' THEN passes := passes + 1; ELSE r := r || E'FAIL cliente não vê o motorista ativo (moto)\n'; fails := fails + 1; END IF;
    IF abs(rec.lat / 0.003 - round(rec.lat / 0.003)) < 1e-6 AND abs(rec.lng / 0.003 - round(rec.lng / 0.003)) < 1e-6 THEN passes := passes + 1; ELSE r := r || E'FAIL posição fora da grade\n'; fails := fails + 1; END IF;
    IF rec.lat <> lat0 + 0.0011 AND rec.lng <> lng0 + 0.0013 THEN passes := passes + 1; ELSE r := r || E'FAIL devolveu a posição exata\n'; fails := fails + 1; END IF;
    IF rec.age_seconds BETWEEN 0 AND 5 THEN passes := passes + 1; ELSE r := r || E'FAIL idade da posição\n'; fails := fails + 1; END IF;
    -- 3) fora do raio: não aparece
    SELECT count(*) INTO n FROM public.get_active_drivers_map(lat0 + 1.0, lng0, 5);
    IF n = 0 THEN passes := passes + 1; ELSE r := r || E'FAIL aparece fora do raio\n'; fails := fails + 1; END IF;
    RESET ROLE;

    -- 4) posição velha (> 10 min), sincronização desligada ou modo motorista desligado: não aparece
    UPDATE public.driver_pricing SET live_updated_at = now() - interval '11 minutes' WHERE driver_id = mot;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.get_active_drivers_map(lat0, lng0, 30);
    IF n = 0 THEN passes := passes + 1; ELSE r := r || E'FAIL aparece com posição velha\n'; fails := fails + 1; END IF;
    RESET ROLE;
    UPDATE public.driver_pricing SET live_updated_at = now(), live_location_sync = false WHERE driver_id = mot;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.get_active_drivers_map(lat0, lng0, 30);
    IF n = 0 THEN passes := passes + 1; ELSE r := r || E'FAIL aparece com sincronização desligada\n'; fails := fails + 1; END IF;
    RESET ROLE;
    UPDATE public.driver_pricing SET live_location_sync = true, driver_mode_active = false WHERE driver_id = mot;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.get_active_drivers_map(lat0, lng0, 30);
    IF n = 0 THEN passes := passes + 1; ELSE r := r || E'FAIL aparece com modo motorista desligado\n'; fails := fails + 1; END IF;
    RESET ROLE;

    -- 5) o próprio motorista não aparece para si
    UPDATE public.driver_pricing SET driver_mode_active = true, live_updated_at = now() WHERE driver_id = mot;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', mot, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.get_active_drivers_map(lat0, lng0, 30) x WHERE abs(x.lat - (lat0 + 0.0011)) < 0.002 AND abs(x.lng - (lng0 + 0.0013)) < 0.002;
    IF n = 0 THEN passes := passes + 1; ELSE r := r || E'FAIL o motorista aparece para si mesmo\n'; fails := fails + 1; END IF;
    RESET ROLE;

    -- 6) argumento inválido
    PERFORM set_config('request.jwt.claims', json_build_object('sub', cli, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM * FROM public.get_active_drivers_map(200, 0, 30); r := r || E'FAIL aceitou latitude inválida\n'; fails := fails + 1;
    EXCEPTION WHEN sqlstate '22023' THEN passes := passes + 1; END;
    RESET ROLE;

    RAISE EXCEPTION 'RESULT: % passes=% fails=%', CASE WHEN fails = 0 THEN 'OK' ELSE E'FALHAS\n' || r END, passes, fails;
END $T$;
