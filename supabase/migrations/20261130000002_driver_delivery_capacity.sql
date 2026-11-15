-- Capacidade de entregas do motorista: quantas entregas de loja ele leva AO MESMO TEMPO (a "mochila"). O motorista iUser escolhe, entre as entregas
-- abertas, as que quiser (qualquer uma, dentro da disponibilidade e do que cabe); o banco recusa a candidatura que passar da capacidade.
-- Só conta entrega de loja (corrida com order_id); corrida de passageiro segue como sempre. Capacidade 1 = o comportamento de antes (uma por vez).
-- Rollback: supabase/rollbacks/driver_delivery_capacity_rollback.sql

ALTER TABLE public.driver_vehicles ADD COLUMN IF NOT EXISTS delivery_capacity smallint NOT NULL DEFAULT 1;
ALTER TABLE public.driver_vehicles DROP CONSTRAINT IF EXISTS driver_vehicles_delivery_capacity_check;
ALTER TABLE public.driver_vehicles ADD CONSTRAINT driver_vehicles_delivery_capacity_check CHECK (delivery_capacity BETWEEN 1 AND 8);
GRANT UPDATE (delivery_capacity) ON public.driver_vehicles TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_ride_applications_insert()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    v_offered numeric;
    v_order uuid;
    v_active integer;
    v_cap integer;
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
    -- Capacidade: entrega de loja só cabe se o motorista ainda tem espaço na mochila (serializa as candidaturas do mesmo motorista)
    IF v_order IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('delivery_capacity:' || NEW.applicant_id::text));
        SELECT count(*) INTO v_active FROM public.ride_requests WHERE driver_id = NEW.applicant_id AND order_id IS NOT NULL AND status = 'accepted';
        SELECT COALESCE(max(delivery_capacity), 1) INTO v_cap FROM public.driver_vehicles WHERE driver_id = NEW.applicant_id;
        IF v_active >= v_cap THEN
            RAISE EXCEPTION 'Sua mochila está cheia: você já está com % entrega(s) e a sua capacidade é %', v_active, v_cap USING ERRCODE = '42501', HINT = 'delivery_capacity_full';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;
