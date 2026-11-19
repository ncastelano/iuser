-- 20261130000076_store_delivery_min_freight.sql
--
-- FRETE MÍNIMO DA ENTREGA DE LOJA + ENDEREÇO OBRIGATÓRIO PARA O ENTREGADOR DO iUSER (18/11/2026; estudo docs/estudos/2026-11-18-delivery-concorrencia-dinheiro.md).
-- (1) O frete de entrega da loja com "Entregador do iUser" é a Tarifa iUser de moto (R$ 5,00 até 3 km + R$ 1,50/km) — abaixo dos R$ 7,50 que o iFood paga
--     por rota curta: no pico os bons entregadores vão para lá. Agora o valor de partida do frete nunca fica abaixo de delivery_dispatch_settings.min_freight
--     (o mesmo "frete mínimo" que o Admin → Entregas já edita; antes só o novo fluxo lia). Padrão R$ 7,00 (só se ainda estava em 0). Quem paga é o cliente;
--     o frete continua 100% do entregador. Mudar o mínimo no Admin já recalcula as lojas.
-- (2) Ligar o Entregador do iUser exige a POSIÇÃO da loja: sem ela o pedido não passa pelo "entregador primeiro" e a corrida não tem ponto de retirada.
--     Lojas que já estavam ligadas sem posição continuam como estão (o bloqueio vale ao LIGAR).
-- Rollback: supabase/rollbacks/store_delivery_min_freight_rollback.sql.

UPDATE public.delivery_dispatch_settings SET min_freight = 7 WHERE min_freight = 0 AND max_freight >= 7
   AND (auto_increase_cap_amount IS NULL OR auto_increase_cap_amount <= max_freight - 7);

CREATE OR REPLACE FUNCTION public.apply_iuser_delivery_tariff()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    t record;
    v_min numeric;
BEGIN
    IF NEW.iuser_delivery_enabled AND NOT COALESCE(NEW.accepts_delivery, false) THEN
        NEW.iuser_delivery_enabled := false;
    END IF;
    -- ligar o Entregador do iUser pede a posição da loja (de onde o entregador retira)
    IF NEW.iuser_delivery_enabled AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.iuser_delivery_enabled, false))
       AND (NEW.store_lat IS NULL OR NEW.store_lng IS NULL) AND NEW.location IS NULL THEN
        RAISE EXCEPTION 'Defina a localização da loja (Editar loja → Dados) antes de ligar o Entregador do iUser: é de lá que o entregador retira os pedidos.'
            USING ERRCODE = '22023', HINT = 'store_location_required';
    END IF;
    IF NEW.iuser_delivery_enabled THEN
        SELECT base_distance_km, base_fee + extra_fee_objeto AS base_fee, price_per_km
          INTO t FROM public.platform_tariffs WHERE vehicle_kind = 'moto';
        IF FOUND THEN
            SELECT COALESCE(min_freight, 0) INTO v_min FROM public.delivery_dispatch_settings LIMIT 1;
            NEW.delivery_type := 'distance';
            NEW.delivery_fee := NULL;
            NEW.delivery_base_distance := t.base_distance_km;
            NEW.delivery_base_fee := GREATEST(t.base_fee, COALESCE(v_min, 0));
            NEW.delivery_fee_per_km := t.price_per_km;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- o admin mudou o frete mínimo: as lojas com entregador iUser acompanham (como já fazem com a tarifa da moto)
CREATE OR REPLACE FUNCTION public.resync_iuser_delivery_on_min_freight() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.min_freight IS DISTINCT FROM OLD.min_freight THEN
        UPDATE public.stores SET iuser_delivery_enabled = true WHERE iuser_delivery_enabled;
    END IF;
    RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.resync_iuser_delivery_on_min_freight() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS dds_resync_iuser_delivery ON public.delivery_dispatch_settings;
CREATE TRIGGER dds_resync_iuser_delivery AFTER UPDATE OF min_freight ON public.delivery_dispatch_settings FOR EACH ROW EXECUTE FUNCTION public.resync_iuser_delivery_on_min_freight();

UPDATE public.stores SET iuser_delivery_enabled = true WHERE iuser_delivery_enabled;
