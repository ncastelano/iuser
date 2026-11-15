-- ATÉ 3 VALORES NA CANDIDATURA DO MOTORISTA (10/11/2026)
-- O motorista pode mandar, numa candidatura só, até 3 valores: o menor fica em `proposed_price` (como sempre) e os outros dois em
-- `alt_prices`. O passageiro vê UM cartão por motorista com as opções e escolhe o valor (select_ride_driver ganhou p_price).
-- Regras (no banco, não só na tela): no máximo 2 valores a mais, cada um MAIOR que o proposto e no máximo o TRIPLO dele, sem repetir;
-- entrega de loja (frete fixo) não tem valores a mais; se a negociação mudar o valor proposto, os valores a mais caem.
-- Rollback: supabase/rollbacks/ride_alt_prices_rollback.sql

ALTER TABLE public.ride_applications ADD COLUMN IF NOT EXISTS alt_prices numeric(10,2)[];
GRANT INSERT (alt_prices), SELECT (alt_prices) ON public.ride_applications TO authenticated;

CREATE OR REPLACE FUNCTION public.ride_applications_alt_prices()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_order uuid;
    v numeric;
    v_out numeric[] := '{}';
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- a negociação mudou o valor proposto: os valores a mais (feitos em cima do anterior) deixam de valer
        IF NEW.proposed_price IS DISTINCT FROM OLD.proposed_price THEN NEW.alt_prices := NULL; END IF;
        RETURN NEW;
    END IF;
    IF NEW.alt_prices IS NULL OR cardinality(NEW.alt_prices) = 0 THEN NEW.alt_prices := NULL; RETURN NEW; END IF;
    SELECT order_id INTO v_order FROM public.ride_offers WHERE id = NEW.ride_request_id;
    IF v_order IS NOT NULL THEN NEW.alt_prices := NULL; RETURN NEW; END IF;   -- entrega de loja: frete fixo
    IF NEW.proposed_price IS NULL OR NEW.proposed_price <= 0 THEN
        RAISE EXCEPTION 'Valores a mais precisam de um valor principal' USING ERRCODE = '23514', HINT = 'alt_prices_invalid';
    END IF;
    IF cardinality(NEW.alt_prices) > 2 THEN
        RAISE EXCEPTION 'No máximo 3 valores por candidatura' USING ERRCODE = '23514', HINT = 'alt_prices_invalid';
    END IF;
    FOREACH v IN ARRAY NEW.alt_prices LOOP
        v := round(v, 2);
        IF v IS NULL OR v <= round(NEW.proposed_price, 2) OR v > round(NEW.proposed_price * 3, 2) OR v = ANY (v_out) THEN
            RAISE EXCEPTION 'Os outros valores precisam ser maiores que o principal e no máximo o triplo dele' USING ERRCODE = '23514', HINT = 'alt_prices_invalid';
        END IF;
        v_out := v_out || v;
    END LOOP;
    SELECT array_agg(x ORDER BY x) INTO NEW.alt_prices FROM unnest(v_out) x;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ride_applications_alt_prices ON public.ride_applications;
CREATE TRIGGER ride_applications_alt_prices BEFORE INSERT OR UPDATE ON public.ride_applications
    FOR EACH ROW EXECUTE FUNCTION public.ride_applications_alt_prices();

-- O passageiro escolhe o motorista E o valor (um dos que ele mandou). Sem p_price vale o principal, como antes.
DROP FUNCTION IF EXISTS public.select_ride_driver(uuid, uuid);
CREATE OR REPLACE FUNCTION public.select_ride_driver(p_ride uuid, p_application uuid, p_price numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    r public.ride_requests;
    a public.ride_applications;
    v_price numeric;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride FOR UPDATE;
    IF NOT FOUND OR r.requester_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.status <> 'pending' THEN RAISE EXCEPTION 'Este pedido já foi decidido.'; END IF;
    SELECT * INTO a FROM public.ride_applications WHERE id = p_application AND ride_request_id = p_ride;
    IF NOT FOUND OR a.status <> 'pending' THEN RAISE EXCEPTION 'Candidatura inválida'; END IF;
    IF a.applicant_id = r.requester_id THEN RAISE EXCEPTION 'Candidatura inválida'; END IF;

    v_price := a.proposed_price;
    IF p_price IS NOT NULL THEN
        IF round(p_price, 2) = round(a.proposed_price, 2) OR round(p_price, 2) = ANY (COALESCE(a.alt_prices, '{}')) THEN
            v_price := round(p_price, 2);
        ELSE
            RAISE EXCEPTION 'Esse valor não está entre os que o motorista mandou' USING ERRCODE = '23514', HINT = 'price_not_offered';
        END IF;
    END IF;

    UPDATE public.ride_requests SET status = 'accepted', driver_id = a.applicant_id,
        agreed_price = CASE WHEN v_price > 0 THEN round(v_price, 2) END WHERE id = p_ride AND status = 'pending';
    UPDATE public.ride_applications SET status = 'accepted' WHERE id = p_application;
    UPDATE public.ride_applications SET status = 'rejected' WHERE ride_request_id = p_ride AND status = 'pending' AND id <> p_application;
    UPDATE public.ride_price_offers SET status = CASE WHEN application_id = p_application AND author_role = 'driver' AND status = 'pending' THEN 'accepted' ELSE 'cancelled' END, responded_at = now()
     WHERE ride_request_id = p_ride AND status = 'pending';
    RETURN jsonb_build_object('ok', true, 'driver_id', a.applicant_id, 'price', v_price);
END; $function$;
REVOKE ALL ON FUNCTION public.select_ride_driver(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_ride_driver(uuid, uuid, numeric) TO authenticated;
