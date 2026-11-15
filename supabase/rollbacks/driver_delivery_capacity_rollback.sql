-- Desfaz a capacidade de entregas (volta a guarda sem o limite).
CREATE OR REPLACE FUNCTION public.guard_ride_applications_insert()
RETURNS trigger LANGUAGE plpgsql AS $function$
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
    SELECT order_id, offered_price INTO v_order, v_offered FROM public.ride_offers WHERE id = NEW.ride_request_id;
    IF v_order IS NOT NULL AND NEW.proposed_price IS DISTINCT FROM v_offered THEN
        RAISE EXCEPTION 'O frete desta entrega é fixo (R$ %): aceite o valor oferecido', v_offered USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE UPDATE (delivery_capacity) ON public.driver_vehicles FROM authenticated;
ALTER TABLE public.driver_vehicles DROP CONSTRAINT IF EXISTS driver_vehicles_delivery_capacity_check;
ALTER TABLE public.driver_vehicles DROP COLUMN IF EXISTS delivery_capacity;
