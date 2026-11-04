-- NEGOCIAÇÃO DE CORRIDAS (passageiro × motorista) + GANHO MÍNIMO POR HORA DO MOTORISTA.
--
-- Tarifa iUser continua sendo só a REFERÊNCIA (km). Aqui entram:
--   1) o passageiro pode OFERECER um valor ao pedir a corrida (ride_requests.passenger_offer, visível aos motoristas em ride_offers);
--   2) cada motorista que se candidata (ride_applications) abre uma conversa PRIVADA de propostas com o passageiro: contraproposta do
--      motorista, nova oferta do passageiro, aceitar ou recusar. O histórico fica em ride_price_offers (só de adição);
--   3) a corrida só fecha quando as duas partes concordam explicitamente com o MESMO valor (ride_requests.agreed_price, congelado);
--   4) cada motorista pode ter um GANHO MÍNIMO POR HORA privado (driver_earning_goals) que só avisa ou, se ele escolher, bloqueia aceites abaixo dele.
-- Entrega de loja (order_id) NÃO entra: o frete segue fixo. Compatível com o fluxo atual: sem oferta do passageiro nada muda (o motorista
-- se candidata com a Tarifa iUser / Minha tarifa / outro valor e o passageiro escolhe, como sempre).

-- ===== CONFIGURAÇÃO DA NEGOCIAÇÃO (linha única) =====
CREATE TABLE IF NOT EXISTS public.ride_negotiation_settings (
    id                boolean PRIMARY KEY DEFAULT true CHECK (id),
    max_rounds        integer NOT NULL DEFAULT 3  CHECK (max_rounds BETWEEN 1 AND 10),         -- propostas por lado, por motorista
    offer_ttl_seconds integer NOT NULL DEFAULT 180 CHECK (offer_ttl_seconds BETWEEN 30 AND 3600) -- quanto tempo vale uma proposta pendente
);
-- VALOR MÍNIMO POR MINUTO de trabalho (ir buscar + corrida): nenhuma corrida de passageiro pode ser fechada por menos que minutos × este valor.
-- R$ 0,50 por minuto = R$ 30 por hora. Editado em Admin → Tarifas (admin_set_ride_minimum); 0 desliga.
ALTER TABLE public.ride_negotiation_settings ADD COLUMN IF NOT EXISTS min_per_minute numeric(6,2) NOT NULL DEFAULT 0.50 CHECK (min_per_minute >= 0 AND min_per_minute <= 20);
INSERT INTO public.ride_negotiation_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.ride_negotiation_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ride_negotiation_settings FROM anon, authenticated;

-- ===== GANHO MÍNIMO POR HORA (PRIVADO DO MOTORISTA) =====
-- Tabela à parte (e não coluna de driver_pricing) porque o passageiro lê driver_pricing da corrida aceita (posição ao vivo) e nunca pode ver isto.
CREATE TABLE IF NOT EXISTS public.driver_earning_goals (
    driver_id  uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    min_hourly numeric(8,2) CHECK (min_hourly IS NULL OR (min_hourly >= 1 AND min_hourly <= 1000)),
    protection text NOT NULL DEFAULT 'warn' CHECK (protection IN ('warn', 'block')),
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.driver_earning_goals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.driver_earning_goals FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_earning_goals TO authenticated;
DROP POLICY IF EXISTS driver_earning_goals_own ON public.driver_earning_goals;
CREATE POLICY driver_earning_goals_own ON public.driver_earning_goals FOR ALL TO authenticated
    USING (driver_id = auth.uid()) WITH CHECK (driver_id = auth.uid());

-- ===== COLUNAS NOVAS =====
ALTER TABLE public.ride_requests
    ADD COLUMN IF NOT EXISTS passenger_offer numeric(10,2) CHECK (passenger_offer IS NULL OR (passenger_offer > 0 AND passenger_offer <= 100000)),
    ADD COLUMN IF NOT EXISTS agreed_price    numeric(10,2) CHECK (agreed_price IS NULL OR (agreed_price > 0 AND agreed_price <= 100000));
ALTER TABLE public.ride_offers ADD COLUMN IF NOT EXISTS passenger_offer numeric(10,2);
-- mexer nelas só pelas funções abaixo: guard_ride_requests_insert/update já barram o app (lista branca de colunas)
ALTER TABLE public.ride_applications
    ADD COLUMN IF NOT EXISTS last_offer_by text CHECK (last_offer_by IS NULL OR last_offer_by IN ('passenger', 'driver')),
    ADD COLUMN IF NOT EXISTS last_offer_at timestamptz;

-- a oferta do passageiro chega aos motoristas pela projeção ride_offers (sem mexer na função grande que a mantém)
CREATE OR REPLACE FUNCTION public.sync_ride_offer_passenger_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.ride_offers SET passenger_offer = NEW.passenger_offer WHERE id = NEW.id;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS zz_ride_requests_sync_passenger_offer ON public.ride_requests;
CREATE TRIGGER zz_ride_requests_sync_passenger_offer AFTER UPDATE OF passenger_offer ON public.ride_requests
    FOR EACH ROW WHEN (NEW.passenger_offer IS DISTINCT FROM OLD.passenger_offer) EXECUTE FUNCTION public.sync_ride_offer_passenger_offer();

-- ===== HISTÓRICO DE PROPOSTAS (só de adição) =====
CREATE TABLE IF NOT EXISTS public.ride_price_offers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_request_id uuid NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
    application_id  uuid REFERENCES public.ride_applications(id) ON DELETE CASCADE,   -- NULL = oferta geral do passageiro (para todos)
    author_id       uuid NOT NULL,
    author_role     text NOT NULL CHECK (author_role IN ('passenger', 'driver')),
    amount          numeric(10,2) NOT NULL CHECK (amount > 0 AND amount <= 100000),
    status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'superseded', 'expired', 'cancelled')),
    expires_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    responded_at    timestamptz
);
CREATE INDEX IF NOT EXISTS ride_price_offers_ride_idx ON public.ride_price_offers (ride_request_id, created_at);
CREATE INDEX IF NOT EXISTS ride_price_offers_app_idx  ON public.ride_price_offers (application_id, created_at);
ALTER TABLE public.ride_price_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ride_price_offers FROM anon, authenticated;
GRANT SELECT ON public.ride_price_offers TO authenticated;
DROP POLICY IF EXISTS ride_price_offers_read ON public.ride_price_offers;
CREATE POLICY ride_price_offers_read ON public.ride_price_offers FOR SELECT TO authenticated USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.ride_requests rr WHERE rr.id = ride_request_id AND rr.requester_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.ride_applications a WHERE a.id = application_id AND a.applicant_id = auth.uid())
);

-- ===== AUXILIARES =====
CREATE OR REPLACE FUNCTION public._neg_cfg(OUT max_rounds integer, OUT ttl_s integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT s.max_rounds FROM public.ride_negotiation_settings s), 3), COALESCE((SELECT s.offer_ttl_seconds FROM public.ride_negotiation_settings s), 180);
$$;
REVOKE ALL ON FUNCTION public._neg_cfg() FROM public, anon, authenticated;

-- "R$ 12,50"
CREATE OR REPLACE FUNCTION public._neg_money(p numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'R$ ' || replace(to_char(p, 'FM999990D00'), '.', ',') $$;
REVOKE ALL ON FUNCTION public._neg_money(numeric) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public._ride_min_per_minute()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT min_per_minute FROM public.ride_negotiation_settings), 0.50);
$$;
REVOKE ALL ON FUNCTION public._ride_min_per_minute() FROM public, anon, authenticated;

-- o mínimo por minuto, para as telas calcularem o piso (público: o valor não é segredo, o passageiro também vê o mínimo do trajeto)
CREATE OR REPLACE FUNCTION public.get_ride_minimum()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public._ride_min_per_minute() $$;
REVOKE ALL ON FUNCTION public.get_ride_minimum() FROM public;
GRANT EXECUTE ON FUNCTION public.get_ride_minimum() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_ride_minimum(p_value numeric, p_admin uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old numeric; v numeric := round(COALESCE(p_value, 0), 2);
BEGIN
    IF v < 0 OR v > 20 THEN RAISE EXCEPTION 'O mínimo por minuto precisa ficar entre R$ 0 e R$ 20' USING ERRCODE = '22023'; END IF;
    SELECT min_per_minute INTO v_old FROM public.ride_negotiation_settings WHERE id;
    UPDATE public.ride_negotiation_settings SET min_per_minute = v WHERE id;
    IF v_old IS DISTINCT FROM v THEN
        INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('ride_minimum', 'min_per_minute', to_jsonb(v_old), to_jsonb(v), p_admin);
    END IF;
    RETURN v;
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_ride_minimum(numeric, uuid) FROM public, anon, authenticated;

-- piso do TRAJETO (só os minutos da corrida, que o servidor conhece): usado onde não há como saber de onde o motorista sai
CREATE OR REPLACE FUNCTION public._ride_trip_floor(p_ride uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE WHEN r.order_id IS NOT NULL THEN 0
                ELSE ceil(COALESCE(r.duration_min, r.distance_km / 40.0 * 60.0, 0) * public._ride_min_per_minute() * 100) / 100 END
    FROM public.ride_requests r WHERE r.id = p_ride;
$$;
REVOKE ALL ON FUNCTION public._ride_trip_floor(uuid) FROM public, anon, authenticated;

-- valor em reais com 2 casas, positivo e dentro do limite (o app nunca é a única validação)
CREATE OR REPLACE FUNCTION public._neg_amount(p numeric)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p IS NULL OR p <= 0 OR p > 100000 THEN RAISE EXCEPTION 'Valor inválido' USING ERRCODE = '22023', HINT = 'invalid_amount'; END IF;
    RETURN round(p, 2);
END; $$;
REVOKE ALL ON FUNCTION public._neg_amount(numeric) FROM public, anon, authenticated;

-- ganho por hora de uma proposta, para o motorista: tempo = ir buscar + corrida (estimativa do servidor, ou a que a tela mostra via Mapbox)
CREATE OR REPLACE FUNCTION public._ride_hourly(p_ride uuid, p_driver uuid, p_amount numeric, p_minutes numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    r public.ride_requests; d public.driver_pricing; g public.driver_earning_goals;
    trip numeric; pick numeric := 0; total numeric; perh numeric; below boolean := false;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride;
    IF NOT FOUND THEN RETURN NULL; END IF;
    -- entrega de loja tem frete fixo e fica fora do ganho mínimo (o motorista aceita ou não, como sempre)
    IF r.order_id IS NOT NULL THEN RETURN jsonb_build_object('minutes', NULL, 'per_hour', NULL, 'min_hourly', NULL, 'protection', 'warn', 'below', false, 'platform_min', NULL, 'below_platform', false, 'blocked', false); END IF;
    trip := COALESCE(r.duration_min, r.distance_km / 40.0 * 60.0, 0);
    SELECT * INTO d FROM public.driver_pricing WHERE driver_id = p_driver;
    IF FOUND AND d.live_lat IS NOT NULL AND d.live_lng IS NOT NULL AND r.origin_lat IS NOT NULL AND r.origin_lng IS NOT NULL
       AND d.live_updated_at > now() - interval '30 minutes' THEN
        pick := (6371 * 2 * asin(sqrt(power(sin(radians(r.origin_lat - d.live_lat) / 2), 2)
                 + cos(radians(d.live_lat)) * cos(radians(r.origin_lat)) * power(sin(radians(r.origin_lng - d.live_lng) / 2), 2))) * 1.3) / 40.0 * 60.0;
    END IF;
    total := trip + pick;
    IF p_minutes IS NOT NULL AND p_minutes BETWEEN 5 AND 600 THEN total := p_minutes; END IF;   -- a estimativa que o motorista está vendo
    IF total > 0 AND p_amount IS NOT NULL THEN perh := round(p_amount / total * 60.0, 2); END IF;
    SELECT * INTO g FROM public.driver_earning_goals WHERE driver_id = p_driver;
    IF FOUND AND g.min_hourly IS NOT NULL AND perh IS NOT NULL THEN below := perh < g.min_hourly; END IF;
    DECLARE pmin numeric := ceil(total * public._ride_min_per_minute() * 100) / 100; below_p boolean := p_amount IS NOT NULL AND p_amount < ceil(total * public._ride_min_per_minute() * 100) / 100;
    BEGIN
        RETURN jsonb_build_object('minutes', round(total, 1), 'per_hour', perh, 'min_hourly', CASE WHEN FOUND THEN g.min_hourly END,
            'protection', CASE WHEN FOUND THEN g.protection ELSE 'warn' END, 'below', below,
            'platform_min', pmin, 'below_platform', below_p,
            'blocked', below_p OR (below AND FOUND AND g.protection = 'block'));
    END;
END; $$;
REVOKE ALL ON FUNCTION public._ride_hourly(uuid, uuid, numeric, numeric) FROM public, anon, authenticated;

-- o motorista confere uma proposta contra o próprio mínimo (a tela e a rota de candidatura usam a mesma conta)
CREATE OR REPLACE FUNCTION public.driver_hourly_check(p_ride uuid, p_amount numeric, p_minutes numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    RETURN public._ride_hourly(p_ride, auth.uid(), p_amount, p_minutes);
END; $$;
REVOKE ALL ON FUNCTION public.driver_hourly_check(uuid, numeric, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.driver_hourly_check(uuid, numeric, numeric) TO authenticated, service_role;

-- ===== NENHUMA CANDIDATURA ABAIXO DO MÍNIMO DA PLATAFORMA =====
-- Aqui só dá para conferir os minutos da corrida (de onde o motorista sai, só a tela sabe): o piso inteiro (buscar + corrida) é conferido
-- por driver_hourly_check antes de enviar. Entrega de loja (frete fixo) fica de fora.
CREATE OR REPLACE FUNCTION public.ride_applications_platform_min()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_floor numeric;
BEGIN
    IF NEW.proposed_price IS NULL THEN RETURN NEW; END IF;
    v_floor := public._ride_trip_floor(NEW.ride_request_id);
    IF v_floor > 0 AND NEW.proposed_price < v_floor THEN
        RAISE EXCEPTION 'O valor mínimo para esta corrida é %', public._neg_money(v_floor) USING HINT = 'below_platform_min', ERRCODE = '23514';
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_applications_platform_min ON public.ride_applications;
CREATE TRIGGER ride_applications_platform_min BEFORE INSERT ON public.ride_applications FOR EACH ROW EXECUTE FUNCTION public.ride_applications_platform_min();

-- ===== A CANDIDATURA JÁ NASCE COM A 1ª PROPOSTA NO HISTÓRICO =====
CREATE OR REPLACE FUNCTION public.ride_applications_negotiation_init()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.proposed_price IS NOT NULL AND NEW.proposed_price > 0 THEN
        INSERT INTO public.ride_price_offers (ride_request_id, application_id, author_id, author_role, amount, status)
        VALUES (NEW.ride_request_id, NEW.id, NEW.applicant_id, 'driver', round(NEW.proposed_price, 2), 'pending');
    END IF;
    UPDATE public.ride_applications SET last_offer_by = 'driver', last_offer_at = now() WHERE id = NEW.id;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_applications_negotiation_init ON public.ride_applications;
CREATE TRIGGER ride_applications_negotiation_init AFTER INSERT ON public.ride_applications
    FOR EACH ROW EXECUTE FUNCTION public.ride_applications_negotiation_init();

-- candidatura RECUSADA: as propostas abertas dela se encerram (na aceitação, quem fecha as propostas é a própria função que confirma o acordo)
CREATE OR REPLACE FUNCTION public.ride_applications_close_offers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.ride_price_offers SET status = 'cancelled', responded_at = now() WHERE application_id = NEW.id AND status = 'pending';
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_applications_close_offers ON public.ride_applications;
CREATE TRIGGER ride_applications_close_offers AFTER UPDATE OF status ON public.ride_applications
    FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'rejected') EXECUTE FUNCTION public.ride_applications_close_offers();

-- ===== FECHAR O ACORDO (as duas partes concordaram com o MESMO valor) =====
CREATE OR REPLACE FUNCTION public._neg_confirm(p_ride public.ride_requests, p_app public.ride_applications, p_amount numeric, p_offer uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.ride_applications SET proposed_price = p_amount, status = 'accepted', last_offer_at = now() WHERE id = p_app.id;
    UPDATE public.ride_applications SET status = 'rejected' WHERE ride_request_id = p_ride.id AND status = 'pending' AND id <> p_app.id;
    UPDATE public.ride_requests SET status = 'accepted', driver_id = p_app.applicant_id, agreed_price = p_amount WHERE id = p_ride.id AND status = 'pending';
    UPDATE public.ride_price_offers SET status = CASE WHEN id = p_offer THEN 'accepted' ELSE 'cancelled' END, responded_at = now()
     WHERE ride_request_id = p_ride.id AND status = 'pending';
END; $$;
REVOKE ALL ON FUNCTION public._neg_confirm(public.ride_requests, public.ride_applications, numeric, uuid) FROM public, anon, authenticated;

-- escolher o motorista (fluxo de sempre): agora também congela o preço acordado e fecha as propostas abertas
CREATE OR REPLACE FUNCTION public.select_ride_driver(p_ride uuid, p_application uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    r public.ride_requests;
    a public.ride_applications;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride FOR UPDATE;
    IF NOT FOUND OR r.requester_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.status <> 'pending' THEN RAISE EXCEPTION 'Este pedido já foi decidido.'; END IF;
    SELECT * INTO a FROM public.ride_applications WHERE id = p_application AND ride_request_id = p_ride;
    IF NOT FOUND OR a.status <> 'pending' THEN RAISE EXCEPTION 'Candidatura inválida'; END IF;
    IF a.applicant_id = r.requester_id THEN RAISE EXCEPTION 'Candidatura inválida'; END IF;

    UPDATE public.ride_requests SET status = 'accepted', driver_id = a.applicant_id,
        agreed_price = CASE WHEN a.proposed_price > 0 THEN round(a.proposed_price, 2) END WHERE id = p_ride AND status = 'pending';
    UPDATE public.ride_applications SET status = 'accepted' WHERE id = p_application;
    UPDATE public.ride_applications SET status = 'rejected' WHERE ride_request_id = p_ride AND status = 'pending' AND id <> p_application;
    UPDATE public.ride_price_offers SET status = CASE WHEN application_id = p_application AND author_role = 'driver' AND status = 'pending' THEN 'accepted' ELSE 'cancelled' END, responded_at = now()
     WHERE ride_request_id = p_ride AND status = 'pending';
    RETURN jsonb_build_object('ok', true, 'driver_id', a.applicant_id);
END; $$;

-- ===== OFERTA DO PASSAGEIRO (para todos os motoristas) =====
CREATE OR REPLACE FUNCTION public.set_passenger_offer(p_ride uuid, p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ride_requests; v numeric := public._neg_amount(p_amount); cfg record; n integer;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride FOR UPDATE;
    IF NOT FOUND OR r.requester_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.order_id IS NOT NULL THEN RAISE EXCEPTION 'O frete de entrega de loja é fixo' USING ERRCODE = '42501'; END IF;
    IF r.status <> 'pending' OR r.driver_id IS NOT NULL THEN RAISE EXCEPTION 'Este pedido já foi decidido.' USING HINT = 'ride_closed'; END IF;
    SELECT * INTO cfg FROM public._neg_cfg();
    IF v < public._ride_trip_floor(p_ride) THEN RAISE EXCEPTION 'O valor mínimo para este trajeto é %', public._neg_money(public._ride_trip_floor(p_ride)) USING HINT = 'below_platform_min', ERRCODE = '23514'; END IF;
    SELECT count(*) INTO n FROM public.ride_price_offers WHERE ride_request_id = p_ride AND application_id IS NULL AND author_role = 'passenger';
    IF n >= cfg.max_rounds THEN RAISE EXCEPTION 'Você já fez o máximo de ofertas para este pedido' USING HINT = 'rounds_exhausted'; END IF;
    UPDATE public.ride_price_offers SET status = 'superseded', responded_at = now() WHERE ride_request_id = p_ride AND application_id IS NULL AND status = 'pending';
    INSERT INTO public.ride_price_offers (ride_request_id, author_id, author_role, amount) VALUES (p_ride, auth.uid(), 'passenger', v);
    UPDATE public.ride_requests SET passenger_offer = v WHERE id = p_ride;
    RETURN jsonb_build_object('ok', true, 'amount', v, 'rounds_left', cfg.max_rounds - n - 1);
END; $$;
REVOKE ALL ON FUNCTION public.set_passenger_offer(uuid, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_passenger_offer(uuid, numeric) TO authenticated, service_role;

-- ===== PASSAGEIRO RESPONDE A UM MOTORISTA COM OUTRO VALOR =====
CREATE OR REPLACE FUNCTION public.passenger_counter(p_application uuid, p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ride_requests; a public.ride_applications; v numeric := public._neg_amount(p_amount); cfg record; n integer; oid uuid; exp timestamptz;
BEGIN
    SELECT ride_request_id INTO oid FROM public.ride_applications WHERE id = p_application;
    SELECT * INTO r FROM public.ride_requests WHERE id = oid FOR UPDATE;
    IF NOT FOUND OR r.requester_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.status <> 'pending' THEN RAISE EXCEPTION 'Este pedido já foi decidido.' USING HINT = 'ride_closed'; END IF;
    SELECT * INTO a FROM public.ride_applications WHERE id = p_application FOR UPDATE;
    IF a.status <> 'pending' THEN RAISE EXCEPTION 'Esta candidatura não está mais aberta' USING HINT = 'application_closed'; END IF;
    IF a.proposed_price IS NOT NULL AND v = a.proposed_price THEN RAISE EXCEPTION 'Esse é o valor que o motorista já pediu: aceite a proposta' USING HINT = 'same_as_proposal'; END IF;
    IF a.proposed_price IS NOT NULL AND v > a.proposed_price THEN RAISE EXCEPTION 'Sua oferta é maior que a proposta do motorista: aceite a proposta' USING HINT = 'above_proposal'; END IF;
    IF v < public._ride_trip_floor(r.id) THEN RAISE EXCEPTION 'O valor mínimo para este trajeto é %', public._neg_money(public._ride_trip_floor(r.id)) USING HINT = 'below_platform_min', ERRCODE = '23514'; END IF;
    SELECT * INTO cfg FROM public._neg_cfg();
    SELECT count(*) INTO n FROM public.ride_price_offers WHERE application_id = p_application AND author_role = 'passenger';
    IF n >= cfg.max_rounds THEN RAISE EXCEPTION 'Você já fez o máximo de ofertas a este motorista' USING HINT = 'rounds_exhausted'; END IF;
    UPDATE public.ride_price_offers SET status = 'superseded', responded_at = now() WHERE application_id = p_application AND status = 'pending';
    exp := now() + make_interval(secs => cfg.ttl_s);
    INSERT INTO public.ride_price_offers (ride_request_id, application_id, author_id, author_role, amount, expires_at) VALUES (r.id, p_application, auth.uid(), 'passenger', v, exp);
    UPDATE public.ride_applications SET last_offer_by = 'passenger', last_offer_at = now() WHERE id = p_application;
    RETURN jsonb_build_object('ok', true, 'amount', v, 'expires_at', exp, 'rounds_left', cfg.max_rounds - n - 1);
END; $$;
REVOKE ALL ON FUNCTION public.passenger_counter(uuid, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.passenger_counter(uuid, numeric) TO authenticated, service_role;

-- ===== MOTORISTA FAZ UMA CONTRAPROPOSTA =====
CREATE OR REPLACE FUNCTION public.driver_counter(p_application uuid, p_amount numeric, p_minutes numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ride_requests; a public.ride_applications; v numeric := public._neg_amount(p_amount); cfg record; n integer; oid uuid; exp timestamptz; h jsonb;
BEGIN
    SELECT ride_request_id INTO oid FROM public.ride_applications WHERE id = p_application;
    SELECT * INTO r FROM public.ride_requests WHERE id = oid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO a FROM public.ride_applications WHERE id = p_application FOR UPDATE;
    IF a.applicant_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.status <> 'pending' OR a.status <> 'pending' THEN RAISE EXCEPTION 'Esta corrida não está mais aberta' USING HINT = 'ride_closed'; END IF;
    IF r.order_id IS NOT NULL THEN RAISE EXCEPTION 'O frete de entrega de loja é fixo' USING ERRCODE = '42501'; END IF;
    h := public._ride_hourly(r.id, auth.uid(), v, p_minutes);
    IF (h->>'below_platform')::boolean THEN RAISE EXCEPTION 'O valor mínimo da plataforma para esta corrida é %', public._neg_money((h->>'platform_min')::numeric) USING HINT = 'below_platform_min', ERRCODE = '23514'; END IF;
    IF (h->>'blocked')::boolean THEN RAISE EXCEPTION 'Esse valor está abaixo do seu ganho mínimo por hora' USING HINT = 'below_min_hourly'; END IF;
    SELECT * INTO cfg FROM public._neg_cfg();
    SELECT count(*) INTO n FROM public.ride_price_offers WHERE application_id = p_application AND author_role = 'driver';
    IF n >= cfg.max_rounds THEN RAISE EXCEPTION 'Você já fez o máximo de propostas nesta corrida' USING HINT = 'rounds_exhausted'; END IF;
    UPDATE public.ride_price_offers SET status = 'superseded', responded_at = now() WHERE application_id = p_application AND status = 'pending';
    exp := CASE WHEN n = 0 THEN NULL ELSE now() + make_interval(secs => cfg.ttl_s) END;   -- a 1ª proposta (a candidatura) não expira; as rodadas seguintes sim
    INSERT INTO public.ride_price_offers (ride_request_id, application_id, author_id, author_role, amount, expires_at) VALUES (r.id, p_application, auth.uid(), 'driver', v, exp);
    UPDATE public.ride_applications SET proposed_price = v, last_offer_by = 'driver', last_offer_at = now() WHERE id = p_application;
    RETURN jsonb_build_object('ok', true, 'amount', v, 'expires_at', exp, 'rounds_left', cfg.max_rounds - n - 1);
END; $$;
REVOKE ALL ON FUNCTION public.driver_counter(uuid, numeric, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.driver_counter(uuid, numeric, numeric) TO authenticated, service_role;

-- ===== ACEITAR OU RECUSAR A PROPOSTA DO OUTRO LADO =====
CREATE OR REPLACE FUNCTION public.respond_ride_offer(p_offer uuid, p_accept boolean, p_minutes numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.ride_price_offers; r public.ride_requests; a public.ride_applications; h jsonb; uid uuid := auth.uid(); latest uuid;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO o FROM public.ride_price_offers WHERE id = p_offer;
    IF NOT FOUND OR o.application_id IS NULL THEN RAISE EXCEPTION 'Proposta inválida' USING ERRCODE = '42501'; END IF;
    SELECT * INTO r FROM public.ride_requests WHERE id = o.ride_request_id FOR UPDATE;
    SELECT * INTO a FROM public.ride_applications WHERE id = o.application_id FOR UPDATE;
    SELECT * INTO o FROM public.ride_price_offers WHERE id = p_offer FOR UPDATE;
    -- só quem está do OUTRO lado da proposta responde
    IF NOT ((o.author_role = 'passenger' AND a.applicant_id = uid) OR (o.author_role = 'driver' AND r.requester_id = uid)) THEN
        RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
    END IF;
    IF o.status <> 'pending' THEN RAISE EXCEPTION 'Esta proposta já foi respondida ou substituída' USING HINT = 'offer_closed'; END IF;
    IF o.expires_at IS NOT NULL AND o.expires_at < now() THEN
        UPDATE public.ride_price_offers SET status = 'expired', responded_at = now() WHERE id = o.id;
        RAISE EXCEPTION 'Esta proposta expirou' USING HINT = 'offer_expired';
    END IF;
    IF r.status <> 'pending' OR a.status <> 'pending' THEN RAISE EXCEPTION 'Esta corrida já foi decidida' USING HINT = 'ride_closed'; END IF;
    SELECT id INTO latest FROM public.ride_price_offers WHERE application_id = o.application_id AND status = 'pending' ORDER BY created_at DESC LIMIT 1;
    IF latest IS DISTINCT FROM o.id THEN RAISE EXCEPTION 'Existe uma proposta mais recente' USING HINT = 'offer_closed'; END IF;

    IF NOT p_accept THEN
        UPDATE public.ride_price_offers SET status = 'declined', responded_at = now() WHERE id = o.id;
        -- passageiro recusou a proposta do motorista: ele sai da disputa. Motorista recusou a oferta do passageiro: a candidatura segue no valor dele.
        IF o.author_role = 'driver' THEN UPDATE public.ride_applications SET status = 'rejected' WHERE id = a.id; END IF;
        UPDATE public.ride_applications SET last_offer_at = now() WHERE id = a.id;
        RETURN jsonb_build_object('ok', true, 'status', 'declined');
    END IF;

    IF o.author_role = 'passenger' THEN
        -- motorista aceitando o valor que o passageiro ofereceu a ELE: respeita o piso do próprio motorista
        h := public._ride_hourly(r.id, uid, o.amount, p_minutes);
        IF (h->>'below_platform')::boolean THEN RAISE EXCEPTION 'O valor mínimo da plataforma para esta corrida é %', public._neg_money((h->>'platform_min')::numeric) USING HINT = 'below_platform_min', ERRCODE = '23514'; END IF;
        IF (h->>'blocked')::boolean THEN RAISE EXCEPTION 'Esse valor está abaixo do seu ganho mínimo por hora' USING HINT = 'below_min_hourly'; END IF;
    ELSIF a.proposed_price IS DISTINCT FROM o.amount THEN
        RAISE EXCEPTION 'A proposta do motorista mudou' USING HINT = 'offer_closed';
    END IF;
    PERFORM public._neg_confirm(r, a, o.amount, o.id);
    RETURN jsonb_build_object('ok', true, 'status', 'accepted', 'agreed_price', o.amount, 'driver_id', a.applicant_id);
END; $$;
REVOKE ALL ON FUNCTION public.respond_ride_offer(uuid, boolean, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.respond_ride_offer(uuid, boolean, numeric) TO authenticated, service_role;

-- ===== EXPIRAÇÃO =====
CREATE OR REPLACE FUNCTION public.expire_ride_price_offers()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
    WITH x AS (UPDATE public.ride_price_offers SET status = 'expired', responded_at = now() WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < now() RETURNING application_id)
    SELECT count(*) INTO n FROM x;
    -- avisa as telas (elas escutam a candidatura)
    UPDATE public.ride_applications a SET last_offer_at = now() WHERE a.status = 'pending'
       AND EXISTS (SELECT 1 FROM public.ride_price_offers o WHERE o.application_id = a.id AND o.status = 'expired' AND o.responded_at > now() - interval '5 seconds');
    RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.expire_ride_price_offers() FROM public, anon, authenticated;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('ride-price-offers-expire') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ride-price-offers-expire');
        PERFORM cron.schedule('ride-price-offers-expire', '* * * * *', 'select public.expire_ride_price_offers()');
    END IF;
END $$;
