-- Rollback de 20261130000048: volta à regra do desconto da migration 46 (o valor do iUser como TETO nos dois valores).
BEGIN;
CREATE OR REPLACE FUNCTION public.set_ride_wait_discount(p_wait uuid, p_base_cents integer, p_rate_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;
COMMIT;
