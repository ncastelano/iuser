-- Rollback de 20261130000045: volta à regra anterior da espera (R$ 0,50 por minuto, 3 min grátis, sem valor inicial) e remove a coluna do valor inicial.
BEGIN;
UPDATE public.ride_wait_settings SET rate_per_minute = 0.50, grace_minutes = 3 WHERE id;
DROP FUNCTION IF EXISTS public.admin_set_ride_wait(numeric, integer, integer, numeric, uuid);
DROP FUNCTION IF EXISTS public._wait_fee_cents(integer, integer, integer, integer);
CREATE OR REPLACE FUNCTION public._wait_fee_cents(p_seconds integer, p_grace integer, p_rate_cents integer)
 RETURNS integer LANGUAGE sql IMMUTABLE
AS $function$
    SELECT CASE WHEN COALESCE(p_seconds, 0) <= COALESCE(p_grace, 0) THEN 0
                ELSE round(((p_seconds - p_grace)::numeric * COALESCE(p_rate_cents, 0)) / 60.0)::integer END
$function$;
CREATE OR REPLACE FUNCTION public._wait_close(p_wait uuid, p_by uuid)
 RETURNS ride_waits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$;

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
END; $function$;

CREATE OR REPLACE FUNCTION public.get_ride_wait_settings()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT jsonb_build_object('rate_per_minute', rate_per_minute, 'grace_minutes', grace_minutes, 'max_minutes', max_minutes) FROM public.ride_wait_settings WHERE id
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_ride_wait(p_rate numeric, p_grace integer, p_max integer, p_admin uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$;
REVOKE ALL ON FUNCTION public.admin_set_ride_wait(numeric, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_ride_wait(numeric, integer, integer, uuid) TO service_role;
ALTER TABLE public.ride_waits DROP COLUMN IF EXISTS base_cents;
ALTER TABLE public.ride_wait_settings DROP COLUMN IF EXISTS base_fee;
COMMIT;
