-- supabase/tests/ride_wait_auto_end_scenarios.sql — a espera termina SOZINHA (migration 20261130000047). Roda dentro de uma transação desfeita; só LOCAL/staging.
BEGIN;
DO $$
DECLARE
    D uuid := '28e08603-96b0-49fc-867e-efc3d8e7d63b';   -- motorista de teste (Ana Silva, tem driver_pricing)
    P uuid; ride uuid; w1 uuid; w2 uuid; w3 uuid; st text; why text; sec int;
BEGIN
    SELECT p.id INTO P FROM profiles p WHERE p.id <> D AND p.is_active AND NOT EXISTS (SELECT 1 FROM ride_requests r WHERE r.requester_id = p.id AND r.status IN ('pending','accepted')) ORDER BY p.created_at LIMIT 1;
    IF NOT EXISTS (SELECT 1 FROM driver_pricing WHERE driver_id = D) THEN RAISE EXCEPTION 'precisa do motorista de teste com driver_pricing'; END IF;
    UPDATE ride_requests SET status = 'cancelled', cancelled_by = 'driver' WHERE driver_id = D AND status = 'accepted';

    INSERT INTO ride_requests (requester_id, driver_id, ride_type, vehicle_type, passenger_count, origin_address, destination_address, origin_lat, origin_lng, destination_lat, destination_lng, distance_km, duration_min, status, driver_en_route, driver_arrived_at)
    VALUES (P, D, 'pessoa', 'carro', 1, 'A', 'B', -8.7683, -63.8847, -8.7503, -63.9127, 4, 9, 'accepted', true, now() - interval '5 minutes') RETURNING id INTO ride;

    -- 1) ESPERA DE EMBARQUE ativa; a corrida COMEÇA → a espera de embarque termina sozinha, com o motivo
    INSERT INTO ride_waits (ride_request_id, kind, status, requested_by, started_at, base_cents, rate_cents, grace_seconds, max_seconds, list_base_cents, list_rate_cents)
    VALUES (ride, 'pickup', 'active', P, now() - interval '4 minutes', 300, 60, 180, 7200, 300, 60) RETURNING id INTO w1;
    UPDATE ride_requests SET ride_started_at = now() WHERE id = ride;
    SELECT status, ended_reason INTO st, why FROM ride_waits WHERE id = w1;
    IF st <> 'ended' OR why <> 'ride_started' THEN RAISE EXCEPTION '1: a espera de embarque deveria terminar ao começar a corrida (%/%)', st, why; END IF;
    IF (SELECT fee_cents FROM ride_waits WHERE id = w1) <> 300 + 60 THEN RAISE EXCEPTION '1: valor errado %', (SELECT fee_cents FROM ride_waits WHERE id = w1); END IF;
    IF NOT EXISTS (SELECT 1 FROM profile_notifications WHERE profile_id = P AND kind = 'ride_wait_ended' AND ref_id = ride) THEN RAISE EXCEPTION '1: o passageiro não foi avisado'; END IF;

    -- 2) PARADA em andamento com o ponto da espera conhecido: o carro anda 80 m (GPS tremendo): continua; passa de 150 m: termina sozinha e cobra até ali
    INSERT INTO ride_waits (ride_request_id, kind, status, requested_by, started_at, base_cents, rate_cents, grace_seconds, max_seconds, list_base_cents, list_rate_cents, anchor_lat, anchor_lng)
    VALUES (ride, 'stop', 'active', P, now() - interval '5 minutes', 300, 60, 180, 7200, 300, 60, -8.7600, -63.9000) RETURNING id INTO w2;
    UPDATE driver_pricing SET live_lat = -8.76072, live_lng = -63.9000, live_updated_at = now() WHERE driver_id = D;          -- ~80 m
    IF (SELECT status FROM ride_waits WHERE id = w2) <> 'active' THEN RAISE EXCEPTION '2: 80 m é GPS mexendo, a espera não podia terminar'; END IF;
    UPDATE driver_pricing SET live_lat = -8.7620, live_lng = -63.9000, live_updated_at = now() WHERE driver_id = D;          -- ~220 m: saiu
    SELECT status, ended_reason, seconds INTO st, why, sec FROM ride_waits WHERE id = w2;
    IF st <> 'ended' OR why <> 'left_spot' THEN RAISE EXCEPTION '2: deveria ter terminado ao sair do local (%/%)', st, why; END IF;
    IF sec NOT BETWEEN 299 AND 302 THEN RAISE EXCEPTION '2: deveria ter parado de contar na hora (5 min): %', sec; END IF;
    IF (SELECT fee_cents FROM ride_waits WHERE id = w2) <> 300 + 120 THEN RAISE EXCEPTION '2: R$ 3,00 + 2 min × R$ 0,60 = 420 centavos, veio %', (SELECT fee_cents FROM ride_waits WHERE id = w2); END IF;
    IF NOT EXISTS (SELECT 1 FROM profile_notifications WHERE profile_id = D AND kind = 'ride_wait_ended' AND ref_id = ride AND meta->>'text' ILIKE '%saiu do local%') THEN RAISE EXCEPTION '2: o motorista não foi avisado'; END IF;
    -- depois de encerrada, andar mais não muda nada
    UPDATE driver_pricing SET live_lat = -8.7700, live_lng = -63.9000, live_updated_at = now() WHERE driver_id = D;
    IF (SELECT fee_cents FROM ride_waits WHERE id = w2) <> 420 THEN RAISE EXCEPTION '2: a espera encerrada mudou'; END IF;

    -- 3) PARADA sem ponto ainda (aprovada sem posição): o primeiro sinal vira o local da espera e NÃO encerra; só depois de sair
    INSERT INTO ride_waits (ride_request_id, kind, status, requested_by, started_at, base_cents, rate_cents, grace_seconds, max_seconds)
    VALUES (ride, 'stop', 'active', P, now() - interval '1 minute', 300, 60, 180, 7200) RETURNING id INTO w3;
    UPDATE driver_pricing SET live_lat = -8.7510, live_lng = -63.9100, live_updated_at = now() WHERE driver_id = D;
    IF (SELECT status || anchor_lat::text FROM ride_waits WHERE id = w3) <> 'active-8.751' THEN RAISE EXCEPTION '3: o primeiro sinal deveria virar o ponto sem encerrar: %', (SELECT status || coalesce(anchor_lat::text, '-') FROM ride_waits WHERE id = w3); END IF;
    UPDATE driver_pricing SET live_lat = -8.7540, live_lng = -63.9100, live_updated_at = now() WHERE driver_id = D;
    IF (SELECT ended_reason FROM ride_waits WHERE id = w3) <> 'left_spot' THEN RAISE EXCEPTION '3: deveria terminar ao sair do ponto'; END IF;

    -- 4) a corrida termina com uma espera aberta: fecha e registra o motivo
    INSERT INTO ride_waits (ride_request_id, kind, status, requested_by, started_at, base_cents, rate_cents, grace_seconds, max_seconds)
    VALUES (ride, 'dropoff', 'active', P, now() - interval '30 seconds', 300, 60, 180, 7200) RETURNING id INTO w1;
    UPDATE ride_requests SET status = 'completed' WHERE id = ride;
    IF (SELECT ended_reason FROM ride_waits WHERE id = w1) <> 'ride_finished' THEN RAISE EXCEPTION '4: motivo da corrida concluída'; END IF;

    RAISE NOTICE 'ride_wait_auto_end: todos os cenários passaram';
END $$;
ROLLBACK;
