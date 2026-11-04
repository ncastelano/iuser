-- Cenários da negociação de corridas (migration 20261130000038). Roda numa transação DESFEITA, só no banco LOCAL/staging:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/ride_negotiation_scenarios.sql
-- A candidatura é criada como "servidor" (as travas de plano/limite já têm testes próprios); o que se testa aqui é a negociação.
BEGIN;

CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION pg_temp.as_server() RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE 'RESET ROLE'; END $$;
CREATE FUNCTION pg_temp.expect_fail(sql text, hint text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE h text;
BEGIN
    BEGIN
        EXECUTE sql;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS h = PG_EXCEPTION_HINT;
        IF hint IS NOT NULL AND coalesce(h, '') <> hint THEN RAISE EXCEPTION 'esperava a dica %, veio % (%)', hint, h, SQLERRM; END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'esperava falhar: %', sql;
END $$;
CREATE FUNCTION pg_temp.new_ride(p uuid, dist numeric, dur numeric) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE id uuid;
BEGIN
    UPDATE ride_requests SET status = 'cancelled', cancelled_by = 'requester' WHERE requester_id = p AND status IN ('pending', 'accepted');   -- só uma corrida ativa por pessoa
    INSERT INTO ride_requests (requester_id, ride_type, origin_address, destination_address, vehicle_type, status, origin_lat, origin_lng, destination_lat, destination_lng, distance_km, duration_min, passenger_count)
    VALUES (p, 'pessoa', 'Rua A, Centro, Porto Velho - RO', 'Rua B, Centro, Porto Velho - RO', 'carro', 'pending', -8.7619, -63.9039, -8.78, -63.88, dist, dur, 1) RETURNING ride_requests.id INTO id;
    RETURN id;
END $$;
CREATE FUNCTION pg_temp.new_app(ride uuid, drv uuid, price numeric) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE id uuid;
BEGIN
    INSERT INTO ride_applications (ride_request_id, applicant_id, status, proposed_price) VALUES (ride, drv, 'pending', price) RETURNING ride_applications.id INTO id;
    RETURN id;
END $$;

DO $$
DECLARE
    P uuid; D1 uuid; D2 uuid; ride uuid; a1 uuid; a2 uuid; o uuid; r jsonb; ag numeric; st text; n int;
BEGIN
    SELECT id INTO P  FROM profiles WHERE is_active ORDER BY created_at LIMIT 1;
    SELECT id INTO D1 FROM profiles WHERE is_active AND id <> P ORDER BY created_at OFFSET 1 LIMIT 1;
    SELECT id INTO D2 FROM profiles WHERE is_active AND id NOT IN (P, D1) ORDER BY created_at OFFSET 2 LIMIT 1;

    -- 1-3) passageiro oferece = referência, menos e mais; a oferta chega aos motoristas (ride_offers) e a anterior é substituída
    ride := pg_temp.new_ride(P, 5, 12);
    PERFORM pg_temp.as_user(P);
    PERFORM set_passenger_offer(ride, 13.26);
    PERFORM set_passenger_offer(ride, 12);
    PERFORM set_passenger_offer(ride, 20);
    PERFORM pg_temp.as_server();
    IF (SELECT passenger_offer FROM ride_offers WHERE id = ride) <> 20 THEN RAISE EXCEPTION '1-3: oferta não chegou aos motoristas'; END IF;
    IF (SELECT count(*) FROM ride_price_offers WHERE ride_request_id = ride AND status = 'superseded') <> 2 THEN RAISE EXCEPTION '1-3: ofertas antigas não foram substituídas'; END IF;
    PERFORM pg_temp.as_user(P);
    PERFORM pg_temp.expect_fail(format('select set_passenger_offer(%L, 21)', ride), 'rounds_exhausted');       -- 4ª oferta: limite de 3
    PERFORM pg_temp.expect_fail(format('select set_passenger_offer(%L, -5)', ride), 'invalid_amount');
    PERFORM pg_temp.expect_fail(format('select set_passenger_offer(%L, 0)', ride), 'invalid_amount');
    PERFORM pg_temp.as_user(D1);
    PERFORM pg_temp.expect_fail(format('select set_passenger_offer(%L, 10)', ride), NULL);                      -- motorista não oferece pelo passageiro
    PERFORM pg_temp.as_server();

    -- 4) motorista aceita na hora a oferta (candidata-se ao valor) e o passageiro confirma: preço acordado = 20
    a1 := pg_temp.new_app(ride, D1, 20);
    IF (SELECT count(*) FROM ride_price_offers WHERE application_id = a1 AND author_role = 'driver' AND status = 'pending') <> 1 THEN RAISE EXCEPTION '4: 1ª proposta não entrou no histórico'; END IF;
    PERFORM pg_temp.as_user(P);
    PERFORM select_ride_driver(ride, a1);
    PERFORM pg_temp.as_server();
    SELECT agreed_price, status INTO ag, st FROM ride_requests WHERE id = ride;
    IF ag <> 20 OR st <> 'accepted' THEN RAISE EXCEPTION '4: acordo errado % %', ag, st; END IF;
    RAISE NOTICE 'OK 1-4';

    -- 5-6) motorista contrapropõe e o passageiro aceita a contraproposta
    ride := pg_temp.new_ride(P, 5, 12);
    a1 := pg_temp.new_app(ride, D1, 18);
    PERFORM pg_temp.as_user(D1);
    r := driver_counter(a1, 16);
    PERFORM pg_temp.as_server();
    IF (SELECT proposed_price FROM ride_applications WHERE id = a1) <> 16 THEN RAISE EXCEPTION '5: proposta do motorista não atualizou'; END IF;
    IF (r->>'expires_at') IS NULL THEN RAISE EXCEPTION '5: a contraproposta deveria expirar'; END IF;
    SELECT id INTO o FROM ride_price_offers WHERE application_id = a1 AND status = 'pending';
    PERFORM pg_temp.as_user(D1);
    PERFORM pg_temp.expect_fail(format('select respond_ride_offer(%L, true)', o), NULL);                        -- não responde à própria proposta
    PERFORM pg_temp.as_user(P);
    r := respond_ride_offer(o, true);
    PERFORM pg_temp.as_server();
    SELECT agreed_price, status INTO ag, st FROM ride_requests WHERE id = ride;
    IF ag <> 16 OR st <> 'accepted' THEN RAISE EXCEPTION '6: acordo errado % %', ag, st; END IF;
    RAISE NOTICE 'OK 5-6';

    -- 7) passageiro faz nova oferta ao motorista e o motorista aceita
    ride := pg_temp.new_ride(P, 5, 12);
    a1 := pg_temp.new_app(ride, D1, 18);
    PERFORM pg_temp.as_user(P);
    PERFORM pg_temp.expect_fail(format('select passenger_counter(%L, 18)', a1), 'same_as_proposal');
    PERFORM pg_temp.expect_fail(format('select passenger_counter(%L, 25)', a1), 'above_proposal');
    PERFORM passenger_counter(a1, 14);
    PERFORM pg_temp.as_server();
    SELECT id INTO o FROM ride_price_offers WHERE application_id = a1 AND author_role = 'passenger' AND status = 'pending';
    PERFORM pg_temp.as_user(P);
    PERFORM pg_temp.expect_fail(format('select respond_ride_offer(%L, true)', o), NULL);                        -- o autor não aceita a própria oferta
    PERFORM pg_temp.as_user(D1);
    PERFORM respond_ride_offer(o, true);
    PERFORM pg_temp.as_server();
    SELECT agreed_price, status INTO ag, st FROM ride_requests WHERE id = ride;
    IF ag <> 14 OR st <> 'accepted' THEN RAISE EXCEPTION '7: acordo errado % %', ag, st; END IF;
    IF (SELECT status FROM ride_price_offers WHERE id = o) <> 'accepted' THEN RAISE EXCEPTION '7: a proposta aceita deve ficar como aceita no histórico'; END IF;
    RAISE NOTICE 'OK 7';

    -- 8) oferta abaixo do ganho mínimo: aviso deixa aceitar, bloqueio impede (e o passageiro nunca vê a meta)
    ride := pg_temp.new_ride(P, 5, 30);   -- 30 min de corrida
    a1 := pg_temp.new_app(ride, D1, 40);
    INSERT INTO driver_earning_goals (driver_id, min_hourly, protection) VALUES (D1, 50, 'warn');
    PERFORM pg_temp.as_user(P);
    PERFORM passenger_counter(a1, 20);   -- 20 em 30 min = R$ 40/h < 50
    PERFORM pg_temp.as_server();
    SELECT id INTO o FROM ride_price_offers WHERE application_id = a1 AND author_role = 'passenger' AND status = 'pending';
    PERFORM pg_temp.as_user(D1);
    IF (driver_hourly_check(ride, 20, 30)->>'below')::boolean IS NOT TRUE THEN RAISE EXCEPTION '8: deveria estar abaixo do mínimo'; END IF;
    IF (driver_hourly_check(ride, 20, 30)->>'blocked')::boolean IS NOT FALSE THEN RAISE EXCEPTION '8: aviso não bloqueia'; END IF;
    PERFORM pg_temp.as_server();
    UPDATE driver_earning_goals SET protection = 'block' WHERE driver_id = D1;
    PERFORM pg_temp.as_user(D1);
    PERFORM pg_temp.expect_fail(format('select respond_ride_offer(%L, true, 30)', o), 'below_min_hourly');
    PERFORM pg_temp.expect_fail(format('select driver_counter(%L, 20, 30)', a1), 'below_min_hourly');
    PERFORM driver_counter(a1, 25, 30);  -- 25 em 30 min = R$ 50/h: ok
    PERFORM pg_temp.as_user(P);
    IF (SELECT count(*) FROM driver_earning_goals) <> 0 THEN RAISE EXCEPTION '8: o passageiro enxergou a meta do motorista'; END IF;
    PERFORM pg_temp.as_server();
    RAISE NOTICE 'OK 8';

    -- 9-12) sem tarifa/meta, motorista longe e corrida demorada
    ride := pg_temp.new_ride(P, 5, 12);
    PERFORM pg_temp.as_user(D2);
    r := driver_hourly_check(ride, 12, NULL);   -- D2 sem meta
    IF r->>'min_hourly' IS NOT NULL OR (r->>'below')::boolean THEN RAISE EXCEPTION '10: sem meta não pode estar abaixo'; END IF;
    IF (r->>'per_hour')::numeric <> 60 THEN RAISE EXCEPTION '9/10: R$ 12 em 12 min = R$ 60/h, veio %', r->>'per_hour'; END IF;
    PERFORM pg_temp.as_server();
    INSERT INTO driver_pricing (driver_id, pricing_mode, live_lat, live_lng, live_updated_at) VALUES (D2, 'platform', -8.90, -63.70, now())
        ON CONFLICT (driver_id) DO UPDATE SET live_lat = -8.90, live_lng = -63.70, live_updated_at = now();
    PERFORM pg_temp.as_user(D2);
    r := driver_hourly_check(ride, 12, NULL);   -- motorista longe: o tempo de buscar entra
    IF (r->>'minutes')::numeric <= 12 THEN RAISE EXCEPTION '11: o deslocamento deveria somar tempo (%).', r->>'minutes'; END IF;
    PERFORM pg_temp.as_server();
    ride := pg_temp.new_ride(P, 5, 60);   -- 5 km em 60 min (trânsito)
    PERFORM pg_temp.as_user(D1);
    IF (driver_hourly_check(ride, 30, 60)->>'per_hour')::numeric <> 30 THEN RAISE EXCEPTION '12: R$ 30 em 60 min = R$ 30/h'; END IF;
    PERFORM pg_temp.as_server();
    RAISE NOTICE 'OK 9-12';

    -- 13) ações concorrentes: dois motoristas, o passageiro fecha um e o outro não consegue mais confirmar nada
    ride := pg_temp.new_ride(P, 5, 12);
    a1 := pg_temp.new_app(ride, D1, 15);
    a2 := pg_temp.new_app(ride, D2, 14);
    PERFORM pg_temp.as_user(P);
    PERFORM passenger_counter(a2, 12);
    PERFORM pg_temp.as_server();
    SELECT id INTO o FROM ride_price_offers WHERE application_id = a2 AND author_role = 'passenger' AND status = 'pending';
    PERFORM pg_temp.as_user(P);
    PERFORM select_ride_driver(ride, a1);   -- escolheu o D1
    PERFORM pg_temp.as_user(D2);
    PERFORM pg_temp.expect_fail(format('select respond_ride_offer(%L, true)', o), NULL);                        -- oferta do D2 foi cancelada/ride fechada
    PERFORM pg_temp.expect_fail(format('select driver_counter(%L, 9)', a2), 'ride_closed');
    PERFORM pg_temp.as_user(P);
    PERFORM pg_temp.expect_fail(format('select select_ride_driver(%L, %L)', ride, a2), NULL);                  -- não confirma duas vezes
    PERFORM pg_temp.as_server();
    IF (SELECT count(*) FROM ride_requests WHERE id = ride AND driver_id = D1 AND agreed_price = 15) <> 1 THEN RAISE EXCEPTION '13: acordo conflitante'; END IF;
    IF (SELECT count(*) FROM ride_price_offers WHERE ride_request_id = ride AND status = 'pending') <> 0 THEN RAISE EXCEPTION '13: sobraram propostas abertas'; END IF;
    RAISE NOTICE 'OK 13';

    -- 14) proposta expira durante a negociação
    ride := pg_temp.new_ride(P, 5, 12);
    a1 := pg_temp.new_app(ride, D1, 18);
    PERFORM pg_temp.as_user(P);
    PERFORM passenger_counter(a1, 14);
    PERFORM pg_temp.as_server();
    UPDATE ride_price_offers SET expires_at = now() - interval '1 second' WHERE application_id = a1 AND author_role = 'passenger' AND status = 'pending';
    SELECT id INTO o FROM ride_price_offers WHERE application_id = a1 AND author_role = 'passenger' AND status = 'pending';
    PERFORM pg_temp.as_user(D1);
    PERFORM pg_temp.expect_fail(format('select respond_ride_offer(%L, true)', o), 'offer_expired');
    PERFORM pg_temp.as_server();
    IF (SELECT status FROM ride_requests WHERE id = ride) <> 'pending' THEN RAISE EXCEPTION '14: proposta expirada não pode fechar a corrida'; END IF;
    UPDATE ride_price_offers SET status = 'pending', expires_at = now() - interval '1 second' WHERE id = o;
    IF expire_ride_price_offers() < 1 THEN RAISE EXCEPTION '14: rotina não expirou'; END IF;
    RAISE NOTICE 'OK 14';

    -- 15) limite de rodadas do motorista e preço congelado depois do acordo
    ride := pg_temp.new_ride(P, 5, 12);
    a1 := pg_temp.new_app(ride, D1, 30);
    PERFORM pg_temp.as_user(D1);
    PERFORM driver_counter(a1, 28);
    PERFORM driver_counter(a1, 26);
    PERFORM pg_temp.expect_fail(format('select driver_counter(%L, 24)', a1), 'rounds_exhausted');   -- 1ª candidatura + 2 contrapropostas = 3
    PERFORM pg_temp.as_user(P);
    SELECT id INTO o FROM ride_price_offers WHERE application_id = a1 AND status = 'pending';
    PERFORM respond_ride_offer(o, true);
    PERFORM pg_temp.as_server();
    UPDATE ride_applications SET proposed_price = 5 WHERE id = a1;   -- servidor mexendo: o preço acordado continua o da corrida
    IF (SELECT agreed_price FROM ride_requests WHERE id = ride) <> 26 THEN RAISE EXCEPTION '15: preço acordado mudou'; END IF;
    PERFORM pg_temp.as_user(P);
    PERFORM pg_temp.expect_fail(format('update ride_requests set agreed_price = 1 where id = %L', ride), NULL);   -- o app não escreve o preço
    PERFORM pg_temp.expect_fail(format('update ride_requests set passenger_offer = 1 where id = %L', ride), NULL);
    PERFORM pg_temp.as_server();
    RAISE NOTICE 'OK 15';


    -- 16) avisos da ilha: cada lado é avisado quando o outro propõe, recusa, aceita ou deixa expirar
    ride := pg_temp.new_ride(P, 5, 12);
    a1 := pg_temp.new_app(ride, D1, 18);
    PERFORM pg_temp.as_user(P);
    PERFORM passenger_counter(a1, 14);                                   -- aviso para o motorista
    PERFORM pg_temp.as_server();
    IF (SELECT count(*) FROM profile_notifications WHERE profile_id = D1 AND kind = 'ride_offer_new' AND ref_id = ride) <> 1 THEN RAISE EXCEPTION '16: motorista não foi avisado da oferta'; END IF;
    IF (SELECT meta->>'text' FROM profile_notifications WHERE profile_id = D1 AND kind = 'ride_offer_new' AND ref_id = ride) NOT LIKE '%R$ 14,00%' THEN RAISE EXCEPTION '16: texto sem o valor'; END IF;
    PERFORM pg_temp.as_user(D1);
    PERFORM driver_counter(a1, 16);                                      -- aviso para o passageiro (2ª proposta do motorista)
    PERFORM pg_temp.as_server();
    IF (SELECT count(*) FROM profile_notifications WHERE profile_id = P AND kind = 'ride_offer_new' AND ref_id = ride) <> 1 THEN RAISE EXCEPTION '16: passageiro não foi avisado da contraproposta'; END IF;
    IF (SELECT count(*) FROM profile_notifications WHERE profile_id = P AND kind = 'ride_offer_new' AND ref_id = ride AND meta->>'text' LIKE '%R$ 18,00%') <> 0 THEN RAISE EXCEPTION '16: a 1ª proposta (candidatura) não deveria gerar este aviso'; END IF;
    SELECT id INTO o FROM ride_price_offers WHERE application_id = a1 AND author_role = 'driver' AND status = 'pending';
    PERFORM pg_temp.as_user(P);
    PERFORM respond_ride_offer(o, false);                                -- recusa: o motorista é avisado
    PERFORM pg_temp.as_server();
    IF (SELECT count(*) FROM profile_notifications WHERE profile_id = D1 AND kind = 'ride_offer_declined' AND ref_id = ride) <> 1 THEN RAISE EXCEPTION '16: autor não foi avisado da recusa'; END IF;
    -- aceite do motorista a uma oferta do passageiro: o passageiro é avisado do acordo
    ride := pg_temp.new_ride(P, 5, 12);
    a1 := pg_temp.new_app(ride, D1, 18);
    PERFORM pg_temp.as_user(P);
    PERFORM passenger_counter(a1, 15);
    PERFORM pg_temp.as_server();
    SELECT id INTO o FROM ride_price_offers WHERE application_id = a1 AND author_role = 'passenger' AND status = 'pending';
    PERFORM pg_temp.as_user(D1);
    PERFORM respond_ride_offer(o, true);
    PERFORM pg_temp.as_server();
    IF (SELECT count(*) FROM profile_notifications WHERE profile_id = P AND kind = 'ride_offer_agreed' AND ref_id = ride) <> 1 THEN RAISE EXCEPTION '16: passageiro não foi avisado do acordo'; END IF;
    -- expiração avisa quem fez a proposta
    ride := pg_temp.new_ride(P, 5, 12);
    a1 := pg_temp.new_app(ride, D2, 18);
    PERFORM pg_temp.as_user(P);
    PERFORM passenger_counter(a1, 14);
    PERFORM pg_temp.as_server();
    UPDATE ride_price_offers SET expires_at = now() - interval '1 second' WHERE application_id = a1 AND author_role = 'passenger' AND status = 'pending';
    PERFORM expire_ride_price_offers();
    IF (SELECT count(*) FROM profile_notifications WHERE profile_id = P AND kind = 'ride_offer_expired' AND ref_id = ride) <> 1 THEN RAISE EXCEPTION '16: quem propôs não foi avisado da expiração'; END IF;
    RAISE NOTICE 'OK 16';
END $$;

ROLLBACK;
