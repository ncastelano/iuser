-- 20261130000047_ride_wait_auto_end.sql
-- A ESPERA TERMINA SOZINHA (06/11/2026): antes ela contava até alguém tocar em "Terminar espera", mesmo com o carro já no destino.
--  • o carro SAIU DO LOCAL DA ESPERA (mais de 150 m do ponto onde a espera começou, pela posição ao vivo do motorista) → a espera se encerra e cobra até ali;
--  • a corrida COMEÇOU → a espera de EMBARQUE acaba (o passageiro entrou);
--  • a corrida terminou ou foi cancelada → já fechava (agora com o motivo registrado).
-- O ponto da espera (`anchor_*`) é a posição ao vivo do motorista na hora em que ele aprova (se a posição for de até 3 min); sem posição, vale a primeira posição que chegar depois.
BEGIN;

ALTER TABLE public.ride_waits ADD COLUMN IF NOT EXISTS anchor_lat double precision, ADD COLUMN IF NOT EXISTS anchor_lng double precision, ADD COLUMN IF NOT EXISTS ended_reason text;

CREATE OR REPLACE FUNCTION public._wait_dist_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) RETURNS double precision
    LANGUAGE sql IMMUTABLE
AS $$ SELECT 6371000 * 2 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))) $$;

-- encerra uma espera em andamento por conta própria (sem ninguém tocar), com o motivo, e avisa as duas pontas
CREATE OR REPLACE FUNCTION public._wait_auto_end(p_wait uuid, p_reason text, p_text text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE w public.ride_waits; r public.ride_requests;
BEGIN
    w := public._wait_close(p_wait, NULL);
    IF w.id IS NULL OR w.status <> 'ended' THEN RETURN; END IF;
    UPDATE public.ride_waits SET ended_reason = p_reason WHERE id = p_wait;
    SELECT * INTO r FROM public.ride_requests WHERE id = w.ride_request_id;
    PERFORM public._notify(r.requester_id, 'ride_wait_ended', NULL, r.id,
        jsonb_build_object('title', 'Espera encerrada', 'text', p_text || ' Valor da espera: ' || public._neg_money(w.fee_cents / 100.0) || '.', 'path', '/pedir-motorista', 'ride_id', r.id), 'rw:' || w.id || ':auto');
    PERFORM public._notify(r.driver_id, 'ride_wait_ended', NULL, r.id,
        jsonb_build_object('title', 'Espera encerrada', 'text', p_text || ' Valor da espera: ' || public._neg_money(w.fee_cents / 100.0) || '.', 'path', '/aceitar-corridas/mapa?ride=' || r.id, 'ride_id', r.id), 'rw:' || w.id || ':auto-d');
END $$;

CREATE OR REPLACE FUNCTION public.respond_ride_wait(p_wait uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        UPDATE public.ride_waits SET status = 'active', started_at = now(), rate_cents = round(s.rate_per_minute * 100)::integer, base_cents = round(s.base_fee * 100)::integer, list_base_cents = round(s.base_fee * 100)::integer,
            anchor_lat = (SELECT live_lat FROM public.driver_pricing WHERE driver_id = auth.uid() AND live_updated_at > now() - interval '3 minutes'),
            anchor_lng = (SELECT live_lng FROM public.driver_pricing WHERE driver_id = auth.uid() AND live_updated_at > now() - interval '3 minutes'), list_rate_cents = round(s.rate_per_minute * 100)::integer,
            grace_seconds = s.grace_minutes * 60, max_seconds = s.max_minutes * 60 WHERE id = p_wait RETURNING * INTO w;
        PERFORM public._notify(r.requester_id, 'ride_wait_started', auth.uid(), r.id,
            jsonb_build_object('title', 'Tempo de espera começou', 'text', v_name || ' aprovou. Espera de ' || public._neg_money(s.base_fee) || ' (já inclui os primeiros ' || s.grace_minutes || ' min); depois ' || public._neg_money(s.rate_per_minute) || ' por minuto.',
                'path', '/pedir-motorista', 'ride_id', r.id), 'rw:' || w.id || ':start');
    ELSE
        UPDATE public.ride_waits SET status = 'declined', ended_at = now(), ended_by = auth.uid() WHERE id = p_wait RETURNING * INTO w;
        PERFORM public._notify(r.requester_id, 'ride_wait_declined', auth.uid(), r.id,
            jsonb_build_object('title', 'Espera recusada', 'text', v_name || ' não pode esperar agora.', 'path', '/pedir-motorista', 'ride_id', r.id), 'rw:' || w.id || ':declined');
    END IF;
    RETURN to_jsonb(w);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_ride_waits(p_ride uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.ride_requests; s public.ride_wait_settings; v_waits jsonb; v_total integer;
BEGIN
    IF auth.uid() IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride;
    IF r.id IS NULL OR (r.requester_id IS DISTINCT FROM auth.uid() AND r.driver_id IS DISTINCT FROM auth.uid()) THEN RETURN NULL; END IF;
    SELECT * INTO s FROM public.ride_wait_settings WHERE id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', w.id, 'kind', w.kind, 'note', w.note, 'status', w.status, 'requested_by', w.requested_by, 'requested_at', w.requested_at,
               'started_at', w.started_at, 'ended_at', w.ended_at, 'ended_reason', w.ended_reason,
               'rate_cents', w.rate_cents, 'base_cents', w.base_cents, 'list_rate_cents', COALESCE(w.list_rate_cents, w.rate_cents), 'list_base_cents', COALESCE(w.list_base_cents, w.base_cents), 'grace_seconds', w.grace_seconds, 'max_seconds', w.max_seconds,
               'seconds', CASE WHEN w.status = 'active' THEN public._wait_seconds(w) ELSE w.seconds END,
               'fee_cents', CASE WHEN w.status = 'active' THEN public._wait_fee_cents(public._wait_seconds(w), w.grace_seconds, w.rate_cents, w.base_cents) ELSE w.fee_cents END
           ) ORDER BY w.requested_at), '[]'::jsonb),
           COALESCE(sum(CASE WHEN w.status = 'active' THEN public._wait_fee_cents(public._wait_seconds(w), w.grace_seconds, w.rate_cents, w.base_cents)
                             WHEN w.status = 'ended' THEN w.fee_cents ELSE 0 END), 0)::integer
      INTO v_waits, v_total
      FROM public.ride_waits w WHERE w.ride_request_id = p_ride;
    RETURN jsonb_build_object('now', now(), 'rate_cents', round(s.rate_per_minute * 100)::integer, 'base_cents', round(s.base_fee * 100)::integer, 'grace_seconds', s.grace_minutes * 60, 'max_seconds', s.max_minutes * 60,
                              'total_fee_cents', v_total, 'waits', v_waits);
END; $function$;

-- o carro saiu do local da espera: a posição ao vivo do motorista passou de 150 m do ponto onde a espera começou
CREATE OR REPLACE FUNCTION public.trg_wait_left_spot() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE w record; d double precision;
BEGIN
    FOR w IN SELECT x.id, x.anchor_lat, x.anchor_lng FROM public.ride_waits x JOIN public.ride_requests r ON r.id = x.ride_request_id
             WHERE r.driver_id = NEW.driver_id AND r.status = 'accepted' AND x.status = 'active' LOOP
        IF w.anchor_lat IS NULL OR w.anchor_lng IS NULL THEN
            UPDATE public.ride_waits SET anchor_lat = NEW.live_lat, anchor_lng = NEW.live_lng WHERE id = w.id;   -- ainda sem ponto: o primeiro sinal depois de aprovar vira o local da espera
            CONTINUE;
        END IF;
        d := public._wait_dist_m(w.anchor_lat, w.anchor_lng, NEW.live_lat, NEW.live_lng);
        IF d > 150 THEN
            PERFORM public._wait_auto_end(w.id, 'left_spot', 'O carro saiu do local da espera, então ela terminou sozinha.');
        END IF;
    END LOOP;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS driver_pricing_wait_left_spot ON public.driver_pricing;
CREATE TRIGGER driver_pricing_wait_left_spot AFTER UPDATE OF live_lat, live_lng ON public.driver_pricing
    FOR EACH ROW WHEN (NEW.live_lat IS NOT NULL AND NEW.live_lng IS NOT NULL AND (OLD.live_lat IS DISTINCT FROM NEW.live_lat OR OLD.live_lng IS DISTINCT FROM NEW.live_lng))
    EXECUTE FUNCTION public.trg_wait_left_spot();

CREATE OR REPLACE FUNCTION public.trg_close_ride_waits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE w record;
BEGIN
    IF NEW.status IN ('completed', 'cancelled') AND OLD.status IS DISTINCT FROM NEW.status THEN
        FOR w IN SELECT id FROM public.ride_waits WHERE ride_request_id = NEW.id AND status = 'active' LOOP
            PERFORM public._wait_close(w.id, NEW.driver_id);
            UPDATE public.ride_waits SET ended_reason = 'ride_finished' WHERE id = w.id;
        END LOOP;
        UPDATE public.ride_waits SET status = 'cancelled', ended_at = now() WHERE ride_request_id = NEW.id AND status = 'requested';
    END IF;
    -- a corrida COMEÇOU: a espera de EMBARQUE acabou (o passageiro entrou); um pedido de embarque que ninguém respondeu cai
    IF NEW.ride_started_at IS NOT NULL AND OLD.ride_started_at IS NULL THEN
        FOR w IN SELECT id FROM public.ride_waits WHERE ride_request_id = NEW.id AND status = 'active' AND kind = 'pickup' LOOP
            PERFORM public._wait_auto_end(w.id, 'ride_started', 'A espera do embarque terminou: a corrida começou.');
        END LOOP;
        UPDATE public.ride_waits SET status = 'cancelled', ended_at = now() WHERE ride_request_id = NEW.id AND status = 'requested' AND kind = 'pickup';
    END IF;
    RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS ride_requests_close_waits ON public.ride_requests;
CREATE TRIGGER ride_requests_close_waits AFTER UPDATE OF status, ride_started_at ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION public.trg_close_ride_waits();

COMMIT;
