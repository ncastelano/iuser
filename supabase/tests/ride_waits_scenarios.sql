-- Cenários das ESPERAS na corrida (migration 20261130000042). Roda numa transação DESFEITA, só no banco LOCAL/staging:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/ride_waits_scenarios.sql
-- O que se testa: quem pode pedir/aprovar/encerrar, a fase certa, o valor SEMPRE do iUser (congelado na aprovação), os minutos grátis, a soma das esperas,
-- o limite de uma espera esquecida aberta, o fechamento automático ao concluir a corrida e o isolamento (estranho não lê nada).
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

DO $$
DECLARE
    P uuid; D uuid; X uuid; ride uuid; w1 uuid; w2 uuid; w3 uuid; w4 uuid; j jsonb; n int; fee int; secs int;
BEGIN
    SELECT id INTO P FROM profiles WHERE is_active ORDER BY created_at LIMIT 1;
    SELECT id INTO D FROM profiles WHERE is_active AND id <> P ORDER BY created_at OFFSET 1 LIMIT 1;
    SELECT id INTO X FROM profiles WHERE is_active AND id NOT IN (P, D) ORDER BY created_at OFFSET 2 LIMIT 1;

    -- 0) as regras de fábrica são do iUser: R$ 3,00 ao acionar (cobre os primeiros 3 min), depois R$ 0,60 por minuto, limite de 120 min por espera
    IF (SELECT base_fee || '/' || rate_per_minute || '/' || grace_minutes || '/' || max_minutes FROM ride_wait_settings WHERE id) <> '3.00/0.60/3/120' THEN RAISE EXCEPTION '0: regras de fábrica'; END IF;

    -- corrida aceita (como servidor: as travas de plano e candidatura já têm testes próprios)
    UPDATE ride_requests SET status = 'cancelled', cancelled_by = 'requester' WHERE requester_id = P AND status IN ('pending', 'accepted');
    INSERT INTO ride_requests (requester_id, ride_type, origin_address, destination_address, vehicle_type, status, origin_lat, origin_lng, destination_lat, destination_lng, distance_km, duration_min, passenger_count)
    VALUES (P, 'pessoa', 'Rua A, Centro, Porto Velho - RO', 'Rua B, Centro, Porto Velho - RO', 'carro', 'pending', -8.7619, -63.9039, -8.78, -63.88, 5, 12, 1) RETURNING id INTO ride;
    UPDATE ride_requests SET status = 'accepted', driver_id = D WHERE id = ride;

    -- 1) só o passageiro pede; o motorista não; estranho não
    PERFORM pg_temp.as_user(D);
    PERFORM pg_temp.expect_fail(format('SELECT request_ride_wait(%L, ''pickup'', NULL)', ride), 'not_passenger');
    PERFORM pg_temp.as_user(X);
    PERFORM pg_temp.expect_fail(format('SELECT request_ride_wait(%L, ''pickup'', NULL)', ride), 'not_passenger');

    -- 2) a fase: parada/desembarque só depois de a corrida começar; embarque só antes
    PERFORM pg_temp.as_user(P);
    PERFORM pg_temp.expect_fail(format('SELECT request_ride_wait(%L, ''stop'', NULL)', ride), 'wrong_phase');
    PERFORM pg_temp.expect_fail(format('SELECT request_ride_wait(%L, ''dropoff'', NULL)', ride), 'wrong_phase');
    PERFORM pg_temp.expect_fail(format('SELECT request_ride_wait(%L, ''banana'', NULL)', ride), NULL);

    -- 3) pedido de embarque; um segundo pedido aberto é recusado; o motorista foi avisado
    w1 := request_ride_wait(ride, 'pickup', '  esperando o elevador  ');
    PERFORM pg_temp.expect_fail(format('SELECT request_ride_wait(%L, ''pickup'', NULL)', ride), 'wait_already_open');
    PERFORM pg_temp.as_server();
    IF (SELECT note FROM ride_waits WHERE id = w1) <> 'esperando o elevador' THEN RAISE EXCEPTION '3: a nota deveria vir sem espaços nas pontas'; END IF;
    IF (SELECT status FROM ride_waits WHERE id = w1) <> 'requested' THEN RAISE EXCEPTION '3: deveria estar pedida, sem relógio'; END IF;
    IF (SELECT started_at FROM ride_waits WHERE id = w1) IS NOT NULL THEN RAISE EXCEPTION '3: sem aprovação não há relógio'; END IF;
    IF NOT EXISTS (SELECT 1 FROM profile_notifications WHERE profile_id = D AND kind = 'ride_wait_requested' AND (meta->>'ride_id')::uuid = ride) THEN RAISE EXCEPTION '3: o motorista não foi avisado'; END IF;

    -- 4) só o motorista aprova (nem o passageiro nem um estranho)
    PERFORM pg_temp.as_user(P);
    PERFORM pg_temp.expect_fail(format('SELECT respond_ride_wait(%L, true)', w1), 'not_driver');
    PERFORM pg_temp.as_user(X);
    PERFORM pg_temp.expect_fail(format('SELECT respond_ride_wait(%L, true)', w1), 'not_driver');
    PERFORM pg_temp.as_user(D);
    j := respond_ride_wait(w1, true);
    IF j->>'status' <> 'active' THEN RAISE EXCEPTION '4: deveria estar em andamento'; END IF;
    PERFORM pg_temp.expect_fail(format('SELECT respond_ride_wait(%L, true)', w1), 'already_answered');
    PERFORM pg_temp.as_server();
    -- o valor foi congelado com as regras do iUser
    IF (SELECT base_cents || '/' || rate_cents || '/' || grace_seconds || '/' || max_seconds FROM ride_waits WHERE id = w1) <> '300/60/180/7200' THEN RAISE EXCEPTION '4: regra não congelada'; END IF;
    IF NOT EXISTS (SELECT 1 FROM profile_notifications WHERE profile_id = P AND kind = 'ride_wait_started') THEN RAISE EXCEPTION '4: o passageiro não foi avisado do início'; END IF;

    -- 5) ao aprovar JÁ vale R$ 3,00; 2 min (dentro dos 3 min cobertos) = R$ 3,00; 8 min = R$ 3,00 + (480 - 180) s × R$ 0,60/min = R$ 6,00; as duas pontas veem o MESMO valor
    PERFORM pg_temp.as_user(P); j := get_ride_waits(ride);
    IF (j->>'total_fee_cents')::int <> 300 THEN RAISE EXCEPTION '5: ao aprovar já deveria valer 300 centavos, veio %', j->>'total_fee_cents'; END IF;
    PERFORM pg_temp.as_server();
    UPDATE ride_waits SET started_at = now() - interval '2 minutes' WHERE id = w1;
    PERFORM pg_temp.as_user(P); j := get_ride_waits(ride);
    IF (j->>'total_fee_cents')::int <> 300 THEN RAISE EXCEPTION '5: 2 min deveriam valer só o valor inicial (300), veio %', j->>'total_fee_cents'; END IF;
    PERFORM pg_temp.as_server();
    UPDATE ride_waits SET started_at = now() - interval '8 minutes' WHERE id = w1;
    PERFORM pg_temp.as_user(P); j := get_ride_waits(ride);
    IF (j->>'total_fee_cents')::int <> 600 THEN RAISE EXCEPTION '5: 8 min deveriam valer 600 centavos, veio %', j->>'total_fee_cents'; END IF;
    PERFORM pg_temp.as_user(D);
    IF (get_ride_waits(ride)->>'total_fee_cents')::int <> 600 THEN RAISE EXCEPTION '5: motorista vê outro valor'; END IF;

    -- 6) estranho não lê nada
    PERFORM pg_temp.as_user(X);
    IF get_ride_waits(ride) IS NOT NULL THEN RAISE EXCEPTION '6: estranho leu as esperas'; END IF;
    IF (SELECT count(*) FROM ride_waits WHERE ride_request_id = ride) <> 0 THEN RAISE EXCEPTION '6: estranho viu linhas de ride_waits'; END IF;

    -- 7) qualquer das duas pontas encerra: o valor fecha e a outra é avisada; estranho não encerra
    PERFORM pg_temp.expect_fail(format('SELECT end_ride_wait(%L)', w1), NULL);
    PERFORM pg_temp.as_user(P);
    j := end_ride_wait(w1);
    IF j->>'status' <> 'ended' OR (j->>'fee_cents')::int <> 600 OR (j->>'seconds')::int NOT BETWEEN 480 AND 482 THEN RAISE EXCEPTION '7: fechamento errado %', j; END IF;
    PERFORM pg_temp.as_server();
    IF NOT EXISTS (SELECT 1 FROM profile_notifications WHERE profile_id = D AND kind = 'ride_wait_ended') THEN RAISE EXCEPTION '7: o motorista não foi avisado do fim'; END IF;

    -- 8) o admin muda a regra: a espera NOVA usa o valor novo; a antiga, já fechada, não muda
    PERFORM admin_set_ride_wait(1.00, 5, 60, 2.00, NULL);   -- valor inicial R$ 2,00 (cobre 5 min), depois R$ 1,00/min, limite 60 min
    UPDATE ride_requests SET ride_started_at = now() WHERE id = ride;     -- a corrida começou
    PERFORM pg_temp.as_user(P);
    w2 := request_ride_wait(ride, 'stop', 'comprar água');
    PERFORM pg_temp.as_user(D);
    PERFORM respond_ride_wait(w2, false);                                -- recusa: sem relógio e sem valor
    PERFORM pg_temp.as_server();
    IF (SELECT status || coalesce(fee_cents::text, '-') FROM ride_waits WHERE id = w2) <> 'declined-' THEN RAISE EXCEPTION '8: recusada deveria ficar sem valor'; END IF;
    IF NOT EXISTS (SELECT 1 FROM profile_notifications WHERE profile_id = P AND kind = 'ride_wait_declined') THEN RAISE EXCEPTION '8: passageiro não foi avisado da recusa'; END IF;
    IF (SELECT fee_cents FROM ride_waits WHERE id = w1) <> 600 THEN RAISE EXCEPTION '8: a espera antiga mudou'; END IF;

    PERFORM pg_temp.as_user(P);
    w3 := request_ride_wait(ride, 'stop', 'comprar água');
    PERFORM pg_temp.expect_fail(format('SELECT request_ride_wait(%L, ''pickup'', NULL)', ride), 'wrong_phase');
    PERFORM pg_temp.as_user(D);
    PERFORM respond_ride_wait(w3, true);
    PERFORM pg_temp.as_server();
    IF (SELECT base_cents || '/' || rate_cents || '/' || grace_seconds || '/' || max_seconds FROM ride_waits WHERE id = w3) <> '200/100/300/3600' THEN RAISE EXCEPTION '8: a espera nova deveria usar a regra nova'; END IF;
    UPDATE ride_waits SET started_at = now() - interval '10 minutes' WHERE id = w3;   -- R$ 2,00 + (600 - 300) s × R$ 1,00/min = R$ 7,00
    PERFORM pg_temp.as_user(D); j := get_ride_waits(ride);
    IF (j->>'total_fee_cents')::int <> 600 + 700 THEN RAISE EXCEPTION '8: as esperas deveriam se somar (600 + 700), veio %', j->>'total_fee_cents'; END IF;
    PERFORM pg_temp.as_user(P); PERFORM end_ride_wait(w3);

    -- 9) um pedido que ninguém respondeu é cancelado por quem pediu (sem valor)
    w4 := request_ride_wait(ride, 'dropoff', NULL);
    PERFORM end_ride_wait(w4);
    PERFORM pg_temp.as_server();
    IF (SELECT status FROM ride_waits WHERE id = w4) <> 'cancelled' THEN RAISE EXCEPTION '9: deveria estar cancelada'; END IF;

    -- 10) a corrida termina com uma espera aberta: ela fecha sozinha e cobra; o limite de uma espera esquecida vale
    PERFORM pg_temp.as_user(P);
    w4 := request_ride_wait(ride, 'dropoff', NULL);
    PERFORM pg_temp.as_user(D); PERFORM respond_ride_wait(w4, true);
    PERFORM pg_temp.as_server();
    UPDATE ride_waits SET started_at = now() - interval '5 hours' WHERE id = w4;       -- esquecida: o limite congelado é de 60 min (regra vigente na aprovação)
    UPDATE ride_requests SET status = 'completed' WHERE id = ride;
    IF (SELECT status FROM ride_waits WHERE id = w4) <> 'ended' THEN RAISE EXCEPTION '10: deveria ter fechado com a corrida'; END IF;
    SELECT seconds, fee_cents INTO secs, fee FROM ride_waits WHERE id = w4;
    IF secs <> 3600 THEN RAISE EXCEPTION '10: o limite de 60 min não valeu: %', secs; END IF;
    IF fee <> 200 + (3600 - 300) * 100 / 60 THEN RAISE EXCEPTION '10: valor do limite errado: %', fee; END IF;

    -- 11) as regras só mudam pelo serviço e dentro dos limites
    -- (o app nunca executa a função do admin; conferido pelo catálogo: chamar função sem permissão derruba o Postgres LOCAL)
    IF has_function_privilege('authenticated', 'public.admin_set_ride_wait(numeric, integer, integer, numeric, uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_set_ride_wait(numeric, integer, integer, numeric, uuid)', 'EXECUTE') THEN RAISE EXCEPTION '11: o app não pode executar admin_set_ride_wait'; END IF;
    PERFORM pg_temp.expect_fail('SELECT admin_set_ride_wait(25, 3, 60, 3, NULL)', NULL);
    PERFORM pg_temp.expect_fail('SELECT admin_set_ride_wait(1, 99, 60, 3, NULL)', NULL);
    PERFORM pg_temp.expect_fail('SELECT admin_set_ride_wait(1, 3, 2, 3, NULL)', NULL);
    PERFORM pg_temp.expect_fail('SELECT admin_set_ride_wait(1, 3, 60, 500, NULL)', NULL);   -- valor inicial acima de R$ 100
    IF (SELECT count(*) FROM admin_config_audit WHERE scope = 'ride_wait') < 3 THEN RAISE EXCEPTION '11: a mudança de regra deveria ficar auditada'; END IF;

    -- 12) o app não escreve direto na tabela
    IF has_table_privilege('authenticated', 'public.ride_waits', 'INSERT') OR has_table_privilege('authenticated', 'public.ride_waits', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.ride_waits', 'DELETE') OR has_table_privilege('anon', 'public.ride_waits', 'SELECT') THEN RAISE EXCEPTION '12: o app só pode LER ride_waits (e só logado)'; END IF;
    IF NOT has_table_privilege('authenticated', 'public.ride_waits', 'SELECT') THEN RAISE EXCEPTION '12: as pontas precisam ler a própria espera'; END IF;
    IF has_table_privilege('authenticated', 'public.ride_wait_settings', 'SELECT') THEN RAISE EXCEPTION '12: as regras só saem pela função pública'; END IF;

    RAISE NOTICE 'ride_waits: todos os cenários passaram';
END $$;
ROLLBACK;
