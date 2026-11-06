-- 20261130000046_ride_wait_discount.sql
-- DESCONTO DO MOTORISTA NA ESPERA (06/11/2026): o valor da espera é do iUser (R$ 3,00 ao acionar, cobre 3 min, depois R$ 0,60/min) e é o TETO. O motorista da corrida pode DIMINUIR
-- (nunca aumentar) o valor inicial e/o valor por minuto daquela espera para dar um desconto; o passageiro é avisado. A espera guarda o valor do iUser (`list_*`) para o teto continuar valendo.
BEGIN;

ALTER TABLE public.ride_waits ADD COLUMN IF NOT EXISTS list_base_cents integer, ADD COLUMN IF NOT EXISTS list_rate_cents integer;

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
        UPDATE public.ride_waits SET status = 'active', started_at = now(), rate_cents = round(s.rate_per_minute * 100)::integer, base_cents = round(s.base_fee * 100)::integer, list_base_cents = round(s.base_fee * 100)::integer, list_rate_cents = round(s.rate_per_minute * 100)::integer,
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
               'started_at', w.started_at, 'ended_at', w.ended_at,
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

CREATE OR REPLACE FUNCTION public.set_ride_wait_discount(p_wait uuid, p_base_cents integer, p_rate_cents integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE w public.ride_waits; r public.ride_requests; v_name text; v_list_base integer; v_list_rate integer;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta' USING ERRCODE = '42501'; END IF;
    SELECT * INTO w FROM public.ride_waits WHERE id = p_wait FOR UPDATE;
    IF w.id IS NULL THEN RAISE EXCEPTION 'Espera não encontrada' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO r FROM public.ride_requests WHERE id = w.ride_request_id;
    IF r.driver_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Só o motorista da corrida dá desconto na espera' USING ERRCODE = '42501', HINT = 'not_driver'; END IF;
    IF w.status <> 'active' THEN RAISE EXCEPTION 'O desconto vale só enquanto a espera está em andamento' USING ERRCODE = 'P0001', HINT = 'wait_not_active'; END IF;
    v_list_base := COALESCE(w.list_base_cents, w.base_cents, 0);
    v_list_rate := COALESCE(w.list_rate_cents, w.rate_cents, 0);
    IF p_base_cents IS NULL OR p_rate_cents IS NULL OR p_base_cents < 0 OR p_rate_cents < 0 THEN RAISE EXCEPTION 'Valores inválidos' USING ERRCODE = '22023', HINT = 'invalid_amount'; END IF;
    IF p_base_cents > v_list_base OR p_rate_cents > v_list_rate THEN
        RAISE EXCEPTION 'Só dá para diminuir: o valor do iUser é o teto (inicial %, por minuto %)', public._neg_money(v_list_base / 100.0), public._neg_money(v_list_rate / 100.0) USING ERRCODE = '22023', HINT = 'above_ceiling';
    END IF;
    UPDATE public.ride_waits SET list_base_cents = v_list_base, list_rate_cents = v_list_rate, base_cents = p_base_cents, rate_cents = p_rate_cents WHERE id = p_wait RETURNING * INTO w;
    SELECT COALESCE(NULLIF(split_part(name, ' ', 1), ''), '@' || "profileSlug", 'O motorista') INTO v_name FROM public.profiles WHERE id = auth.uid();
    IF p_base_cents < v_list_base OR p_rate_cents < v_list_rate THEN
        PERFORM public._notify(r.requester_id, 'ride_wait_started', auth.uid(), r.id,
            jsonb_build_object('title', 'Desconto na espera', 'text', v_name || ' deu um desconto: valor inicial ' || public._neg_money(p_base_cents / 100.0) || ' e ' || public._neg_money(p_rate_cents / 100.0) || ' por minuto.',
                'path', '/pedir-motorista', 'ride_id', r.id), 'rw:' || w.id || ':disc:' || p_base_cents || ':' || p_rate_cents);
    END IF;
    RETURN to_jsonb(w);
END $$;
REVOKE ALL ON FUNCTION public.set_ride_wait_discount(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ride_wait_discount(uuid, integer, integer) TO authenticated, service_role;

COMMIT;
