-- TARIFA POR TEMPO DO MOTORISTA + ESPERAS NA CORRIDA (embarque, paradas, desembarque).
-- Depende da 20261130000038 (helpers _notify/_neg_money, ride_negotiation_settings), da 20261130000039 (push dos avisos) e da 20261130000041 (lista de avisos com os digitais).
--
-- (1) "Minha tarifa por tempo" = o terceiro valor da corrida (A = Tarifa iUser, B = Minha tarifa por km, C = Minha tarifa por tempo): um valor por minuto
--     (ir buscar + corrida) que o motorista define. O mínimo da plataforma e o ganho mínimo por hora dele valem para C como valem para B.
-- (2) ESPERA: o valor por minuto e os minutos grátis são SEMPRE do iUser (ride_wait_settings, Admin → Tarifas), nunca do motorista. O passageiro PEDE,
--     o motorista APROVA e só então o relógio começa, para os dois, com o valor subindo ao vivo. Cada espera tem seus minutos grátis; as esperas se somam.
--     O valor é calculado aqui, no servidor, pelos horários registrados (o app só mostra); o iUser não movimenta esse dinheiro (a corrida é paga por fora).

-- ===== (1) tarifa por tempo =====
ALTER TABLE public.driver_pricing
    ADD COLUMN IF NOT EXISTS price_per_minute numeric(6,2) CHECK (price_per_minute IS NULL OR (price_per_minute >= 0 AND price_per_minute <= 20));

-- ===== (2) regras da espera (uma linha só, do iUser) =====
CREATE TABLE IF NOT EXISTS public.ride_wait_settings (
    id              boolean PRIMARY KEY DEFAULT true CHECK (id),
    rate_per_minute numeric(6,2) NOT NULL DEFAULT 0.50 CHECK (rate_per_minute >= 0 AND rate_per_minute <= 20),
    grace_minutes   integer NOT NULL DEFAULT 3 CHECK (grace_minutes >= 0 AND grace_minutes <= 30),
    max_minutes     integer NOT NULL DEFAULT 120 CHECK (max_minutes >= 5 AND max_minutes <= 480)   -- uma espera esquecida aberta nunca cobra além disto
);
INSERT INTO public.ride_wait_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.ride_wait_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ride_wait_settings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.ride_waits (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_request_id uuid NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
    kind            text NOT NULL CHECK (kind IN ('pickup', 'stop', 'dropoff')),   -- embarque, parada (inclusive a pedida no meio do caminho) e desembarque
    note            text CHECK (note IS NULL OR char_length(note) <= 80),
    status          text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'active', 'ended', 'declined', 'cancelled')),
    requested_by    uuid NOT NULL REFERENCES public.profiles(id),
    requested_at    timestamptz NOT NULL DEFAULT now(),
    started_at      timestamptz,
    ended_at        timestamptz,
    ended_by        uuid,
    -- congelados quando o motorista aprova: mudar a regra no Admin não mexe numa espera em andamento
    rate_cents      integer,
    grace_seconds   integer,
    max_seconds     integer,
    seconds         integer,
    fee_cents       integer
);
CREATE INDEX IF NOT EXISTS ride_waits_ride_idx ON public.ride_waits (ride_request_id, requested_at);
-- uma espera aberta (pedida ou em andamento) por corrida
CREATE UNIQUE INDEX IF NOT EXISTS ride_waits_one_open ON public.ride_waits (ride_request_id) WHERE status IN ('requested', 'active');
ALTER TABLE public.ride_waits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ride_waits FROM anon, authenticated;
GRANT SELECT ON public.ride_waits TO authenticated;
DROP POLICY IF EXISTS ride_waits_parties ON public.ride_waits;
CREATE POLICY ride_waits_parties ON public.ride_waits FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.id = ride_request_id AND (r.requester_id = auth.uid() OR r.driver_id = auth.uid())));

-- ===== a conta: centavos inteiros, pelos segundos; os minutos grátis abatem do começo (mesma regra de src/modules/ridewait/domain.ts) =====
CREATE OR REPLACE FUNCTION public._wait_fee_cents(p_seconds integer, p_grace integer, p_rate_cents integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN COALESCE(p_seconds, 0) <= COALESCE(p_grace, 0) THEN 0
                ELSE round(((p_seconds - p_grace)::numeric * COALESCE(p_rate_cents, 0)) / 60.0)::integer END
$$;

-- segundos de uma espera (em andamento: até agora), nunca além do limite congelado
CREATE OR REPLACE FUNCTION public._wait_seconds(w public.ride_waits)
RETURNS integer LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN w.started_at IS NULL THEN 0
                ELSE LEAST(GREATEST(floor(extract(epoch FROM (COALESCE(w.ended_at, now()) - w.started_at)))::integer, 0), COALESCE(w.max_seconds, 7200)) END
$$;

-- fecha uma espera em andamento: grava segundos e valor
CREATE OR REPLACE FUNCTION public._wait_close(p_wait uuid, p_by uuid)
RETURNS public.ride_waits LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.ride_waits; v_s integer;
BEGIN
    SELECT * INTO w FROM public.ride_waits WHERE id = p_wait FOR UPDATE;
    IF w.id IS NULL OR w.status <> 'active' THEN RETURN w; END IF;
    w.ended_at := now();
    v_s := public._wait_seconds(w);
    UPDATE public.ride_waits SET status = 'ended', ended_at = w.ended_at, ended_by = p_by, seconds = v_s,
        fee_cents = public._wait_fee_cents(v_s, grace_seconds, rate_cents)
    WHERE id = p_wait RETURNING * INTO w;
    RETURN w;
END; $$;
REVOKE ALL ON FUNCTION public._wait_close(uuid, uuid) FROM public, anon, authenticated;

-- ===== PASSAGEIRO PEDE =====
CREATE OR REPLACE FUNCTION public.request_ride_wait(p_ride uuid, p_kind text, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ride_requests; v_id uuid; v_note text := NULLIF(btrim(COALESCE(p_note, '')), ''); v_name text; v_n integer;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta' USING ERRCODE = '42501'; END IF;
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride FOR UPDATE;
    IF r.id IS NULL OR r.requester_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Só quem pediu a corrida pode pedir tempo de espera' USING ERRCODE = '42501', HINT = 'not_passenger'; END IF;
    IF r.status <> 'accepted' OR r.driver_id IS NULL THEN RAISE EXCEPTION 'A corrida não está em andamento' USING ERRCODE = 'P0001', HINT = 'ride_not_active'; END IF;
    IF r.order_id IS NOT NULL THEN RAISE EXCEPTION 'Entrega de loja não tem tempo de espera' USING ERRCODE = 'P0001', HINT = 'not_for_deliveries'; END IF;
    IF p_kind NOT IN ('pickup', 'stop', 'dropoff') THEN RAISE EXCEPTION 'Tipo de espera inválido' USING ERRCODE = '22023'; END IF;
    IF (p_kind = 'pickup') <> (r.ride_started_at IS NULL) THEN
        RAISE EXCEPTION '%', CASE WHEN p_kind = 'pickup' THEN 'A espera no embarque só vale antes de a corrida começar' ELSE 'Paradas e desembarque só valem depois de a corrida começar' END USING ERRCODE = 'P0001', HINT = 'wrong_phase';
    END IF;
    IF v_note IS NOT NULL AND char_length(v_note) > 80 THEN v_note := left(v_note, 80); END IF;
    SELECT count(*) INTO v_n FROM public.ride_waits WHERE ride_request_id = p_ride;
    IF v_n >= 12 THEN RAISE EXCEPTION 'Esta corrida já teve muitos pedidos de espera' USING ERRCODE = 'P0001', HINT = 'too_many_waits'; END IF;
    BEGIN
        INSERT INTO public.ride_waits (ride_request_id, kind, note, requested_by) VALUES (p_ride, p_kind, v_note, auth.uid()) RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Já existe uma espera aberta nesta corrida' USING ERRCODE = 'P0001', HINT = 'wait_already_open';
    END;
    SELECT COALESCE(NULLIF(split_part(name, ' ', 1), ''), '@' || "profileSlug", 'O passageiro') INTO v_name FROM public.profiles WHERE id = auth.uid();
    PERFORM public._notify(r.driver_id, 'ride_wait_requested', auth.uid(), r.id,
        jsonb_build_object('title', 'Pedido de tempo de espera',
            'text', v_name || ' pediu para você esperar' || CASE p_kind WHEN 'pickup' THEN ' no embarque' WHEN 'dropoff' THEN ' no desembarque' ELSE ' numa parada' END || COALESCE(' (' || v_note || ')', '') || '. Aprove para começar a contar.',
            'path', '/aceitar-corridas/mapa?ride=' || r.id, 'ride_id', r.id),
        'rw:' || v_id || ':req');
    RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.request_ride_wait(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_ride_wait(uuid, text, text) TO authenticated;

-- ===== MOTORISTA APROVA OU RECUSA (aprovar = o relógio começa para os dois) =====
CREATE OR REPLACE FUNCTION public.respond_ride_wait(p_wait uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.ride_waits; r public.ride_requests; s public.ride_wait_settings; v_name text;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta' USING ERRCODE = '42501'; END IF;
    SELECT * INTO w FROM public.ride_waits WHERE id = p_wait FOR UPDATE;
    IF w.id IS NULL THEN RAISE EXCEPTION 'Espera não encontrada' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO r FROM public.ride_requests WHERE id = w.ride_request_id;
    IF r.driver_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Só o motorista da corrida aprova a espera' USING ERRCODE = '42501', HINT = 'not_driver'; END IF;
    IF w.status <> 'requested' THEN RAISE EXCEPTION 'Este pedido já foi respondido' USING ERRCODE = 'P0001', HINT = 'already_answered'; END IF;
    IF r.status <> 'accepted' THEN RAISE EXCEPTION 'A corrida não está em andamento' USING ERRCODE = 'P0001', HINT = 'ride_not_active'; END IF;
    SELECT * INTO s FROM public.ride_wait_settings WHERE id;
    SELECT COALESCE(NULLIF(split_part(name, ' ', 1), ''), '@' || "profileSlug", 'O motorista') INTO v_name FROM public.profiles WHERE id = auth.uid();
    IF p_accept THEN
        UPDATE public.ride_waits SET status = 'active', started_at = now(), rate_cents = round(s.rate_per_minute * 100)::integer,
            grace_seconds = s.grace_minutes * 60, max_seconds = s.max_minutes * 60 WHERE id = p_wait RETURNING * INTO w;
        PERFORM public._notify(r.requester_id, 'ride_wait_started', auth.uid(), r.id,
            jsonb_build_object('title', 'Tempo de espera começou', 'text', v_name || ' aprovou. Os primeiros ' || s.grace_minutes || ' min são grátis; depois ' || public._neg_money(s.rate_per_minute) || ' por minuto.',
                'path', '/pedir-motorista', 'ride_id', r.id), 'rw:' || w.id || ':start');
    ELSE
        UPDATE public.ride_waits SET status = 'declined', ended_at = now(), ended_by = auth.uid() WHERE id = p_wait RETURNING * INTO w;
        PERFORM public._notify(r.requester_id, 'ride_wait_declined', auth.uid(), r.id,
            jsonb_build_object('title', 'Espera recusada', 'text', v_name || ' não pode esperar agora.', 'path', '/pedir-motorista', 'ride_id', r.id), 'rw:' || w.id || ':declined');
    END IF;
    RETURN to_jsonb(w);
END; $$;
REVOKE ALL ON FUNCTION public.respond_ride_wait(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.respond_ride_wait(uuid, boolean) TO authenticated;

-- ===== QUALQUER UM DOS DOIS ENCERRA (em andamento: fecha e cobra; só pedida: cancela) =====
CREATE OR REPLACE FUNCTION public.end_ride_wait(p_wait uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.ride_waits; r public.ride_requests; v_other uuid;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta' USING ERRCODE = '42501'; END IF;
    SELECT * INTO w FROM public.ride_waits WHERE id = p_wait FOR UPDATE;
    IF w.id IS NULL THEN RAISE EXCEPTION 'Espera não encontrada' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO r FROM public.ride_requests WHERE id = w.ride_request_id;
    IF auth.uid() IS DISTINCT FROM r.requester_id AND auth.uid() IS DISTINCT FROM r.driver_id THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF w.status = 'requested' THEN
        UPDATE public.ride_waits SET status = 'cancelled', ended_at = now(), ended_by = auth.uid() WHERE id = p_wait RETURNING * INTO w;
    ELSIF w.status = 'active' THEN
        w := public._wait_close(p_wait, auth.uid());
        v_other := CASE WHEN auth.uid() = r.requester_id THEN r.driver_id ELSE r.requester_id END;
        IF v_other IS NOT NULL THEN
            PERFORM public._notify(v_other, 'ride_wait_ended', auth.uid(), r.id,
                jsonb_build_object('title', 'Espera encerrada', 'text', 'A espera durou ' || (w.seconds / 60) || ' min ' || lpad((w.seconds % 60)::text, 2, '0') || ' s: ' || public._neg_money(w.fee_cents / 100.0) || '.',
                    'path', CASE WHEN v_other = r.driver_id THEN '/aceitar-corridas/mapa?ride=' || r.id ELSE '/pedir-motorista' END, 'ride_id', r.id), 'rw:' || w.id || ':end');
        END IF;
    END IF;
    RETURN to_jsonb(w);
END; $$;
REVOKE ALL ON FUNCTION public.end_ride_wait(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.end_ride_wait(uuid) TO authenticated;

-- ===== LEITURA PARA AS DUAS PONTAS: as esperas, o relógio do servidor (para os dois relógios baterem) e o total já com o que está correndo =====
CREATE OR REPLACE FUNCTION public.get_ride_waits(p_ride uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ride_requests; s public.ride_wait_settings; v_waits jsonb; v_total integer;
BEGIN
    IF auth.uid() IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride;
    IF r.id IS NULL OR (r.requester_id IS DISTINCT FROM auth.uid() AND r.driver_id IS DISTINCT FROM auth.uid()) THEN RETURN NULL; END IF;
    SELECT * INTO s FROM public.ride_wait_settings WHERE id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', w.id, 'kind', w.kind, 'note', w.note, 'status', w.status, 'requested_by', w.requested_by, 'requested_at', w.requested_at,
               'started_at', w.started_at, 'ended_at', w.ended_at,
               'rate_cents', w.rate_cents, 'grace_seconds', w.grace_seconds, 'max_seconds', w.max_seconds,
               'seconds', CASE WHEN w.status = 'active' THEN public._wait_seconds(w) ELSE w.seconds END,
               'fee_cents', CASE WHEN w.status = 'active' THEN public._wait_fee_cents(public._wait_seconds(w), w.grace_seconds, w.rate_cents) ELSE w.fee_cents END
           ) ORDER BY w.requested_at), '[]'::jsonb),
           COALESCE(sum(CASE WHEN w.status = 'active' THEN public._wait_fee_cents(public._wait_seconds(w), w.grace_seconds, w.rate_cents)
                             WHEN w.status = 'ended' THEN w.fee_cents ELSE 0 END), 0)::integer
      INTO v_waits, v_total
      FROM public.ride_waits w WHERE w.ride_request_id = p_ride;
    RETURN jsonb_build_object('now', now(), 'rate_cents', round(s.rate_per_minute * 100)::integer, 'grace_seconds', s.grace_minutes * 60, 'max_seconds', s.max_minutes * 60,
                              'total_fee_cents', v_total, 'waits', v_waits);
END; $$;
REVOKE ALL ON FUNCTION public.get_ride_waits(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_ride_waits(uuid) TO authenticated;

-- as regras vigentes (públicas: aparecem no aviso "primeiros 3 min grátis; depois R$ 0,50 por minuto")
CREATE OR REPLACE FUNCTION public.get_ride_wait_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object('rate_per_minute', rate_per_minute, 'grace_minutes', grace_minutes, 'max_minutes', max_minutes) FROM public.ride_wait_settings WHERE id
$$;
GRANT EXECUTE ON FUNCTION public.get_ride_wait_settings() TO anon, authenticated;

-- ===== ADMIN (só o serviço; o id do admin vem do login na rota) =====
CREATE OR REPLACE FUNCTION public.admin_set_ride_wait(p_rate numeric, p_grace integer, p_max integer, p_admin uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.ride_wait_settings; v_rate numeric := round(COALESCE(p_rate, 0), 2);
BEGIN
    IF v_rate < 0 OR v_rate > 20 THEN RAISE EXCEPTION 'O valor da espera precisa ficar entre R$ 0,00 e R$ 20,00 por minuto' USING ERRCODE = '22023'; END IF;
    IF p_grace < 0 OR p_grace > 30 THEN RAISE EXCEPTION 'Os minutos grátis ficam entre 0 e 30' USING ERRCODE = '22023'; END IF;
    IF p_max < 5 OR p_max > 480 THEN RAISE EXCEPTION 'O limite de uma espera fica entre 5 e 480 minutos' USING ERRCODE = '22023'; END IF;
    SELECT * INTO o FROM public.ride_wait_settings WHERE id;
    UPDATE public.ride_wait_settings SET rate_per_minute = v_rate, grace_minutes = p_grace, max_minutes = p_max WHERE id;
    IF o.rate_per_minute IS DISTINCT FROM v_rate THEN INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('ride_wait', 'rate_per_minute', to_jsonb(o.rate_per_minute), to_jsonb(v_rate), p_admin); END IF;
    IF o.grace_minutes IS DISTINCT FROM p_grace THEN INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('ride_wait', 'grace_minutes', to_jsonb(o.grace_minutes), to_jsonb(p_grace), p_admin); END IF;
    IF o.max_minutes IS DISTINCT FROM p_max THEN INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('ride_wait', 'max_minutes', to_jsonb(o.max_minutes), to_jsonb(p_max), p_admin); END IF;
    RETURN jsonb_build_object('rate_per_minute', v_rate, 'grace_minutes', p_grace, 'max_minutes', p_max);
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_ride_wait(numeric, integer, integer, uuid) FROM public, anon, authenticated;

-- ===== a corrida terminou (concluída ou cancelada): a espera em andamento fecha e cobra; a só pedida cancela =====
CREATE OR REPLACE FUNCTION public.trg_close_ride_waits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w record;
BEGIN
    IF NEW.status IN ('completed', 'cancelled') AND OLD.status IS DISTINCT FROM NEW.status THEN
        FOR w IN SELECT id FROM public.ride_waits WHERE ride_request_id = NEW.id AND status = 'active' LOOP
            PERFORM public._wait_close(w.id, NEW.driver_id);
        END LOOP;
        UPDATE public.ride_waits SET status = 'cancelled', ended_at = now() WHERE ride_request_id = NEW.id AND status = 'requested';
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_requests_close_waits ON public.ride_requests;
CREATE TRIGGER ride_requests_close_waits AFTER UPDATE OF status ON public.ride_requests
    FOR EACH ROW EXECUTE FUNCTION public.trg_close_ride_waits();

-- ===== avisos novos (ilha + push) =====
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup', 'service_application',
    'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review',
    'customer_review', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered',
    'delivery_driver_assigned', 'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready',
    'delivery_completed', 'delivery_done', 'delivery_driver_cancelled', 'delivery_cancelled', 'delivery_at_door', 'delivery_message', 'delivery_issue',
    'favorite_invite', 'favorite_accepted', 'favorite_declined', 'dues_update', 'dispute_update', 'moderation_update',
    'ride_offer_new', 'ride_offer_declined', 'ride_offer_agreed', 'ride_offer_expired',
    'digital_order_new', 'digital_access_released',
    'ride_wait_requested', 'ride_wait_started', 'ride_wait_declined', 'ride_wait_ended'
]));

CREATE OR REPLACE FUNCTION public.trg_ping_live_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.kind = ANY (ARRAY[
        'delivery_driver_assigned', 'delivery_picked_up', 'delivery_at_door', 'delivery_message', 'delivery_issue',
        'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_driver_cancelled', 'delivery_cancelled',
        'delivery_order_ready', 'delivery_completed',
        'favorite_invite', 'favorite_accepted', 'favorite_declined',
        'dues_update', 'dispute_update',
        'moderation_update',
        'ride_offer_new', 'ride_offer_declined', 'ride_offer_agreed', 'ride_offer_expired',
        'ride_wait_requested', 'ride_wait_started', 'ride_wait_declined', 'ride_wait_ended'
    ]) THEN
        PERFORM public._ping_delivery_events();
    END IF;
    RETURN NEW;
END; $$;
