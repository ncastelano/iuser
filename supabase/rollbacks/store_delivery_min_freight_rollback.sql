-- Rollback de 20261130000076_store_delivery_min_freight.sql: o frete da loja volta a ser só a Tarifa iUser de moto e ligar o Entregador do iUser não pede mais a posição.
-- (min_freight fica no valor atual: ele também é o mínimo do novo fluxo; volte a 0 à mão em Admin → Entregas se quiser.)
BEGIN;
DROP TRIGGER IF EXISTS dds_resync_iuser_delivery ON public.delivery_dispatch_settings;
DROP FUNCTION IF EXISTS public.resync_iuser_delivery_on_min_freight();
CREATE OR REPLACE FUNCTION public.apply_iuser_delivery_tariff()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t record;
BEGIN
    IF NEW.iuser_delivery_enabled AND NOT COALESCE(NEW.accepts_delivery, false) THEN NEW.iuser_delivery_enabled := false; END IF;
    IF NEW.iuser_delivery_enabled THEN
        SELECT base_distance_km, base_fee + extra_fee_objeto AS base_fee, price_per_km INTO t FROM public.platform_tariffs WHERE vehicle_kind = 'moto';
        IF FOUND THEN
            NEW.delivery_type := 'distance'; NEW.delivery_fee := NULL;
            NEW.delivery_base_distance := t.base_distance_km; NEW.delivery_base_fee := t.base_fee; NEW.delivery_fee_per_km := t.price_per_km;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;
UPDATE public.stores SET iuser_delivery_enabled = true WHERE iuser_delivery_enabled;
COMMIT;
