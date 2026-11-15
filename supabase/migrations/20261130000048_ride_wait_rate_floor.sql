-- 20261130000048_ride_wait_rate_floor.sql
-- AJUSTE DA ESPERA (06/11/2026): o valor POR MINUTO da espera nunca fica abaixo do mínimo do iUser (R$ 0,60) — antes o motorista conseguia baixar para R$ 0,30.
-- O desconto vale só no VALOR INICIAL (até o valor do iUser); no valor por minuto o motorista pode pôr o SEU (acima do mínimo, até R$ 20,00).
BEGIN;

CREATE OR REPLACE FUNCTION public.set_ride_wait_discount(p_wait uuid, p_base_cents integer, p_rate_cents integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE w public.ride_waits; r public.ride_requests; v_name text; v_list_base integer; v_list_rate integer;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta' USING ERRCODE = '42501'; END IF;
    SELECT * INTO w FROM public.ride_waits WHERE id = p_wait FOR UPDATE;
    IF w.id IS NULL THEN RAISE EXCEPTION 'Espera não encontrada' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO r FROM public.ride_requests WHERE id = w.ride_request_id;
    IF r.driver_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Só o motorista da corrida muda o valor da espera' USING ERRCODE = '42501', HINT = 'not_driver'; END IF;
    IF w.status <> 'active' THEN RAISE EXCEPTION 'O valor só muda enquanto a espera está em andamento' USING ERRCODE = 'P0001', HINT = 'wait_not_active'; END IF;
    v_list_base := COALESCE(w.list_base_cents, w.base_cents, 0);
    v_list_rate := COALESCE(w.list_rate_cents, w.rate_cents, 0);
    IF p_base_cents IS NULL OR p_rate_cents IS NULL OR p_base_cents < 0 OR p_rate_cents < 0 THEN RAISE EXCEPTION 'Valores inválidos' USING ERRCODE = '22023', HINT = 'invalid_amount'; END IF;
    -- o VALOR INICIAL pode ganhar desconto (nunca passa do valor do iUser); o valor POR MINUTO nunca fica abaixo do mínimo do iUser (o motorista pode pôr o seu, acima dele, até R$ 20)
    IF p_base_cents > v_list_base THEN
        RAISE EXCEPTION 'O valor inicial pode ter desconto, mas não passar de % (o do iUser)', public._neg_money(v_list_base / 100.0) USING ERRCODE = '22023', HINT = 'above_ceiling';
    END IF;
    IF p_rate_cents < v_list_rate THEN
        RAISE EXCEPTION 'O valor por minuto não pode ficar abaixo de % (o mínimo do iUser)', public._neg_money(v_list_rate / 100.0) USING ERRCODE = '22023', HINT = 'below_floor';
    END IF;
    IF p_rate_cents > 2000 THEN RAISE EXCEPTION 'O valor por minuto fica entre % e R$ 20,00', public._neg_money(v_list_rate / 100.0) USING ERRCODE = '22023', HINT = 'invalid_amount'; END IF;
    UPDATE public.ride_waits SET list_base_cents = v_list_base, list_rate_cents = v_list_rate, base_cents = p_base_cents, rate_cents = p_rate_cents WHERE id = p_wait RETURNING * INTO w;
    SELECT COALESCE(NULLIF(split_part(name, ' ', 1), ''), '@' || "profileSlug", 'O motorista') INTO v_name FROM public.profiles WHERE id = auth.uid();
    IF p_base_cents <> v_list_base OR p_rate_cents <> v_list_rate THEN
        PERFORM public._notify(r.requester_id, 'ride_wait_started', auth.uid(), r.id,
            jsonb_build_object('title', 'Valor da espera mudou', 'text', v_name || ' ajustou a espera: valor inicial ' || public._neg_money(p_base_cents / 100.0) || ' e ' || public._neg_money(p_rate_cents / 100.0) || ' por minuto.',
                'path', '/pedir-motorista', 'ride_id', r.id), 'rw:' || w.id || ':disc:' || p_base_cents || ':' || p_rate_cents);
    END IF;
    RETURN to_jsonb(w);
END $$;

-- esperas que já estavam com o minuto abaixo do mínimo voltam ao mínimo do iUser
UPDATE public.ride_waits SET rate_cents = list_rate_cents WHERE list_rate_cents IS NOT NULL AND rate_cents < list_rate_cents AND status = 'active';

COMMIT;
