-- Cenários dos valores a mais da candidatura (migration 20261130000064). Transação DESFEITA, só no banco LOCAL/staging:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/ride_alt_prices_scenarios.sql
BEGIN;
CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); EXECUTE 'SET LOCAL ROLE authenticated'; END $$;
CREATE FUNCTION pg_temp.as_server() RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE 'RESET ROLE'; END $$;
CREATE FUNCTION pg_temp.expect_fail(sql text, hint text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE h text;
BEGIN
    BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS h = PG_EXCEPTION_HINT;
        IF hint IS NOT NULL AND coalesce(h, '') <> hint THEN RAISE EXCEPTION 'esperava a dica %, veio % (%)', hint, h, SQLERRM; END IF; RETURN; END;
    RAISE EXCEPTION 'esperava falhar: %', sql;
END $$;

DO $$
DECLARE P uuid; D1 uuid; D2 uuid; ride uuid; a1 uuid; alts numeric[]; ag numeric;
BEGIN
    SELECT id INTO P  FROM profiles WHERE is_active ORDER BY created_at LIMIT 1;
    SELECT id INTO D1 FROM profiles WHERE is_active AND id <> P ORDER BY created_at OFFSET 1 LIMIT 1;
    SELECT id INTO D2 FROM profiles WHERE is_active AND id NOT IN (P, D1) ORDER BY created_at OFFSET 2 LIMIT 1;
    UPDATE ride_negotiation_settings SET min_per_minute = 0, min_ride_fare = 0;
    UPDATE ride_requests SET status = 'cancelled', cancelled_by = 'requester' WHERE requester_id = P AND status IN ('pending', 'accepted');
    INSERT INTO ride_requests (requester_id, ride_type, origin_address, destination_address, vehicle_type, status, origin_lat, origin_lng, destination_lat, destination_lng, distance_km, duration_min, passenger_count)
    VALUES (P, 'pessoa', 'Rua A, Centro', 'Rua B, Centro', 'carro', 'pending', -8.7619, -63.9039, -8.78, -63.88, 5, 12, 1) RETURNING id INTO ride;

    -- 1) valores a mais guardados em ordem
    INSERT INTO ride_applications (ride_request_id, applicant_id, status, proposed_price, alt_prices) VALUES (ride, D1, 'pending', 20, ARRAY[35, 25.5]) RETURNING id, alt_prices INTO a1, alts;
    IF alts <> ARRAY[25.5, 35]::numeric[] THEN RAISE EXCEPTION '1: ordem %', alts; END IF;
    -- 2) menor ou igual ao principal, acima do triplo, repetido ou 3 a mais: recusado
    PERFORM pg_temp.expect_fail(format('INSERT INTO ride_applications (ride_request_id, applicant_id, status, proposed_price, alt_prices) VALUES (%L, %L, ''pending'', 20, ARRAY[19])', ride, D2), 'alt_prices_invalid');
    PERFORM pg_temp.expect_fail(format('INSERT INTO ride_applications (ride_request_id, applicant_id, status, proposed_price, alt_prices) VALUES (%L, %L, ''pending'', 20, ARRAY[60.01])', ride, D2), 'alt_prices_invalid');
    PERFORM pg_temp.expect_fail(format('INSERT INTO ride_applications (ride_request_id, applicant_id, status, proposed_price, alt_prices) VALUES (%L, %L, ''pending'', 20, ARRAY[30, 30])', ride, D2), 'alt_prices_invalid');
    PERFORM pg_temp.expect_fail(format('INSERT INTO ride_applications (ride_request_id, applicant_id, status, proposed_price, alt_prices) VALUES (%L, %L, ''pending'', 20, ARRAY[30, 40, 50])', ride, D2), 'alt_prices_invalid');
    -- 3) o motorista não muda os valores depois
    PERFORM pg_temp.as_user(D1);
    BEGIN UPDATE ride_applications SET alt_prices = ARRAY[59] WHERE id = a1; EXCEPTION WHEN OTHERS THEN NULL; END;   -- recusado ou sem efeito
    PERFORM pg_temp.as_server();
    IF (SELECT alt_prices FROM ride_applications WHERE id = a1) <> ARRAY[25.5, 35]::numeric[] THEN RAISE EXCEPTION '3: motorista mudou os valores'; END IF;
    -- 4) o passageiro não escolhe valor que não foi mandado
    PERFORM pg_temp.as_user(P);
    PERFORM pg_temp.expect_fail(format('SELECT select_ride_driver(%L, %L, 30)', ride, a1), 'price_not_offered');
    -- 5) escolhe um dos valores a mais: vira o valor combinado
    PERFORM select_ride_driver(ride, a1, 35);
    PERFORM pg_temp.as_server();
    SELECT agreed_price INTO ag FROM ride_requests WHERE id = ride;
    IF ag <> 35 THEN RAISE EXCEPTION '5: combinado %', ag; END IF;
    -- 6) negociação muda o principal: os valores a mais caem
    UPDATE ride_applications SET proposed_price = 22 WHERE id = a1 RETURNING alt_prices INTO alts;
    IF alts IS NOT NULL THEN RAISE EXCEPTION '6: deveriam cair'; END IF;
    RAISE NOTICE 'ride_alt_prices: 6 cenários OK';
END $$;
ROLLBACK;
