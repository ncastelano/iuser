-- Etapa 1.5 / Grupo B — proteção de ESCRITA em ride_requests e ride_applications.
--
-- Problema: as policies de UPDATE eram por linha ("é o dono", "é o motorista aceito") e liberavam QUALQUER coluna:
-- offered_price, store_id, order_id, driver_id, status (inclusive 'completed' sem entregar). O INSERT também aceitava
-- corrida já "aceita", com order_id/store_id/offered_price escolhidos pelo cliente.
--
-- Correção (no banco, não depende do app):
--  * gatilhos de guarda: só papéis de cliente (authenticated/anon) passam por eles; funções do servidor
--    (SECURITY DEFINER, service role, cron) são confiáveis e fazem a própria validação;
--  * colunas sensíveis ficam imutáveis para o cliente; status só muda por transições permitidas;
--  * escolher o motorista e concluir a corrida passam a ser funções (select_ride_driver / complete_ride);
--  * candidatura em entrega de loja só vale pelo frete oferecido (o motorista não define preço).
-- Mantidos: índice de uma corrida ativa por pedido, aceite automático condicional, cobrança de R$ 0,50 (gatilho de
-- conclusão continua o mesmo).

-- ============================================================
-- 1. INSERT em ride_requests: só uma corrida NOVA e pendente, sem campos do servidor
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_ride_requests_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF NEW.requester_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Corrida só pode ser criada em nome de quem está logado' USING ERRCODE = '42501';
    END IF;
    IF NEW.order_id IS NOT NULL OR NEW.store_id IS NOT NULL OR NEW.offered_price IS NOT NULL OR NEW.visible_radius_km IS NOT NULL THEN
        RAISE EXCEPTION 'Entrega de loja só é criada pelo servidor' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM 'pending'
       OR NEW.driver_id IS NOT NULL OR NEW.cancelled_by IS NOT NULL
       OR NEW.driver_en_route IS TRUE OR NEW.driver_departed_at IS NOT NULL OR NEW.driver_arrived_at IS NOT NULL
       OR NEW.ride_started_at IS NOT NULL OR NEW.stop1_reached_at IS NOT NULL OR NEW.stop2_reached_at IS NOT NULL
       OR COALESCE(NEW.applicant_count, 0) <> 0
       OR NEW.extra_task_minutes IS NOT NULL OR NEW.extra_task_fee IS NOT NULL OR NEW.extra_task_description IS NOT NULL THEN
        RAISE EXCEPTION 'Corrida nova começa pendente, sem motorista e sem etapas' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ride_requests_guard_insert ON public.ride_requests;
CREATE TRIGGER ride_requests_guard_insert
    BEFORE INSERT ON public.ride_requests
    FOR EACH ROW EXECUTE FUNCTION public.guard_ride_requests_insert();

-- ============================================================
-- 2. UPDATE em ride_requests: colunas por papel + transições de status
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_ride_requests_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    uid uuid := auth.uid();
    is_req boolean := (uid IS NOT NULL AND uid = OLD.requester_id);
    is_drv boolean := (uid IS NOT NULL AND OLD.driver_id IS NOT NULL AND uid = OLD.driver_id);
    allowed text[] := '{}';
    expected text;
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF NOT (is_req OR is_drv) THEN
        RAISE EXCEPTION 'Sem permissão para alterar esta corrida' USING ERRCODE = '42501';
    END IF;

    -- Colunas que cada papel pode mexer. Todo o resto (preço, loja, pedido, motorista, endereços...) é do servidor.
    IF is_req THEN allowed := allowed || ARRAY['status', 'cancelled_by']; END IF;
    IF is_drv THEN
        allowed := allowed || ARRAY['status', 'cancelled_by', 'driver_en_route', 'driver_departed_at', 'driver_arrived_at',
                                    'ride_started_at', 'stop1_reached_at', 'stop2_reached_at',
                                    'extra_task_minutes', 'extra_task_fee', 'extra_task_description'];
    END IF;
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
        RAISE EXCEPTION 'Campo protegido: só o servidor altera preço, vínculos e dados da corrida' USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        -- A única mudança de status direta é cancelar; aceitar e concluir têm função própria.
        IF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'accepted') THEN
            expected := CASE WHEN is_req THEN 'requester' ELSE 'driver' END;
            IF NEW.cancelled_by IS DISTINCT FROM expected THEN
                RAISE EXCEPTION 'cancelled_by inválido' USING ERRCODE = '42501';
            END IF;
            IF NOT is_req AND OLD.status <> 'accepted' THEN
                RAISE EXCEPTION 'O motorista só cancela corrida que aceitou' USING ERRCODE = '42501';
            END IF;
        ELSE
            RAISE EXCEPTION 'Mudança de status não permitida por aqui (use a operação própria: aceitar, concluir ou cancelar)' USING ERRCODE = '42501';
        END IF;
    ELSIF NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by THEN
        RAISE EXCEPTION 'cancelled_by só muda ao cancelar' USING ERRCODE = '42501';
    END IF;

    -- Etapas do motorista só existem com a corrida aceita, e uma vez gravadas não são reescritas.
    IF (NEW.driver_en_route, NEW.driver_departed_at, NEW.driver_arrived_at, NEW.ride_started_at, NEW.stop1_reached_at, NEW.stop2_reached_at,
        NEW.extra_task_minutes, NEW.extra_task_fee, NEW.extra_task_description)
       IS DISTINCT FROM
       (OLD.driver_en_route, OLD.driver_departed_at, OLD.driver_arrived_at, OLD.ride_started_at, OLD.stop1_reached_at, OLD.stop2_reached_at,
        OLD.extra_task_minutes, OLD.extra_task_fee, OLD.extra_task_description) THEN
        IF OLD.status <> 'accepted' THEN
            RAISE EXCEPTION 'Etapas da corrida só podem ser registradas com a corrida aceita' USING ERRCODE = '42501';
        END IF;
        IF (OLD.driver_departed_at IS NOT NULL AND NEW.driver_departed_at IS DISTINCT FROM OLD.driver_departed_at)
           OR (OLD.driver_arrived_at IS NOT NULL AND NEW.driver_arrived_at IS DISTINCT FROM OLD.driver_arrived_at)
           OR (OLD.ride_started_at IS NOT NULL AND NEW.ride_started_at IS DISTINCT FROM OLD.ride_started_at)
           OR (OLD.stop1_reached_at IS NOT NULL AND NEW.stop1_reached_at IS DISTINCT FROM OLD.stop1_reached_at)
           OR (OLD.stop2_reached_at IS NOT NULL AND NEW.stop2_reached_at IS DISTINCT FROM OLD.stop2_reached_at) THEN
            RAISE EXCEPTION 'Etapa já registrada não pode ser alterada' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ride_requests_guard_update ON public.ride_requests;
CREATE TRIGGER ride_requests_guard_update
    BEFORE UPDATE ON public.ride_requests
    FOR EACH ROW EXECUTE FUNCTION public.guard_ride_requests_update();

-- ============================================================
-- 3. Escolher o motorista (só o dono do pedido, entre candidatos reais, com a corrida pendente)
-- ============================================================
CREATE OR REPLACE FUNCTION public.select_ride_driver(p_ride uuid, p_application uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

    UPDATE public.ride_requests SET status = 'accepted', driver_id = a.applicant_id WHERE id = p_ride AND status = 'pending';
    UPDATE public.ride_applications SET status = 'accepted' WHERE id = p_application;
    UPDATE public.ride_applications SET status = 'rejected' WHERE ride_request_id = p_ride AND status = 'pending' AND id <> p_application;
    RETURN jsonb_build_object('ok', true, 'driver_id', a.applicant_id);
END;
$$;
REVOKE ALL ON FUNCTION public.select_ride_driver(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_ride_driver(uuid, uuid) TO authenticated;

-- ============================================================
-- 4. Concluir a corrida (só o motorista dela, com a corrida iniciada e chegada ao destino)
--    Mesmas condições que o app já pedia (iniciar antes; até 100 m do destino), agora validadas aqui.
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_ride(p_ride uuid, p_lat double precision, p_lng double precision)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    r public.ride_requests;
    v_m numeric;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride FOR UPDATE;
    IF NOT FOUND OR r.driver_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.status <> 'accepted' THEN RAISE EXCEPTION 'Essa corrida não está em andamento'; END IF;
    IF r.ride_started_at IS NULL THEN RAISE EXCEPTION 'Inicie a corrida antes de concluir.'; END IF;
    IF r.destination_lat IS NULL OR r.destination_lng IS NULL THEN
        RAISE EXCEPTION 'Não dá pra confirmar a chegada: esse pedido não tem coordenadas de destino.';
    END IF;
    IF p_lat IS NULL OR p_lng IS NULL THEN RAISE EXCEPTION 'Não conseguimos confirmar sua localização.'; END IF;
    v_m := public.haversine_km(r.destination_lat, r.destination_lng, p_lat, p_lng) * 1000;
    IF v_m > 100 THEN
        RAISE EXCEPTION 'Você está a % m do destino. Chegue a até 100 m pra concluir.', round(v_m);
    END IF;
    IF r.order_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.orders WHERE id = r.order_id AND status = 'rejected') THEN
        RAISE EXCEPTION 'O pedido desta entrega foi recusado';
    END IF;

    -- (o gatilho existente exige as paradas concluídas; e o de R$ 0,50 / sync da entrega disparam como sempre)
    UPDATE public.ride_requests SET status = 'completed' WHERE id = p_ride AND status = 'accepted';
    RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_ride(uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_ride(uuid, double precision, double precision) TO authenticated;

-- ============================================================
-- 5. ride_applications: o dono só recusa (status); candidatura em entrega de loja vale só pelo frete oferecido
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_ride_applications_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
        RAISE EXCEPTION 'Campo protegido da candidatura' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'pending' AND NEW.status = 'rejected') THEN
        RAISE EXCEPTION 'Para escolher o motorista use a operação própria' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ride_applications_guard_update ON public.ride_applications;
CREATE TRIGGER ride_applications_guard_update
    BEFORE UPDATE ON public.ride_applications
    FOR EACH ROW EXECUTE FUNCTION public.guard_ride_applications_update();

CREATE OR REPLACE FUNCTION public.guard_ride_applications_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_offered numeric;
    v_order uuid;
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF NEW.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Candidatura nova começa pendente' USING ERRCODE = '42501';
    END IF;
    IF NEW.proposed_price IS NOT NULL AND (NEW.proposed_price <= 0 OR NEW.proposed_price > 100000) THEN
        RAISE EXCEPTION 'Valor inválido' USING ERRCODE = '42501';
    END IF;
    -- O frete de entrega de loja é fixo: quem aceita, aceita o valor oferecido (nada de preço próprio por aqui)
    SELECT order_id, offered_price INTO v_order, v_offered FROM public.ride_offers WHERE id = NEW.ride_request_id;
    IF v_order IS NOT NULL AND NEW.proposed_price IS DISTINCT FROM v_offered THEN
        RAISE EXCEPTION 'O frete desta entrega é fixo (R$ %): aceite o valor oferecido', v_offered USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ride_applications_guard_insert ON public.ride_applications;
CREATE TRIGGER ride_applications_guard_insert
    BEFORE INSERT ON public.ride_applications
    FOR EACH ROW EXECUTE FUNCTION public.guard_ride_applications_insert();
