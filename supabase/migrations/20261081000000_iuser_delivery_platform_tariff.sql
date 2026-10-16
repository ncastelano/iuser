-- Entrega iUser: o valor da entrega NÃO é da loja, é a Tarifa da plataforma
-- (platform_tariffs, editada em Admin → Tarifas) pra moto + a cobrança extra de objeto.
-- A loja escolhe UMA das três: entrega ela mesma (e define o valor), entregador do
-- iUser (valor da plataforma) ou não faz entrega.
--
-- As colunas delivery_* da loja continuam sendo a única coisa que o checkout lê;
-- quando a loja usa o entregador do iUser, o banco as mantém iguais à tarifa. Assim o
-- cliente paga exatamente o frete que o motorista recebe, e ninguém consegue mudar isso
-- pela API (o gatilho sobrescreve).

CREATE OR REPLACE FUNCTION public.apply_iuser_delivery_tariff()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    t record;
BEGIN
    IF NEW.iuser_delivery_enabled AND NOT COALESCE(NEW.accepts_delivery, false) THEN
        NEW.iuser_delivery_enabled := false;
    END IF;
    IF NEW.iuser_delivery_enabled THEN
        SELECT base_distance_km, base_fee + extra_fee_objeto AS base_fee, price_per_km
          INTO t FROM public.platform_tariffs WHERE vehicle_kind = 'moto';
        IF FOUND THEN
            NEW.delivery_type := 'distance';
            NEW.delivery_fee := NULL;
            NEW.delivery_base_distance := t.base_distance_km;
            NEW.delivery_base_fee := t.base_fee;
            NEW.delivery_fee_per_km := t.price_per_km;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stores_apply_iuser_delivery_tariff ON public.stores;
CREATE TRIGGER stores_apply_iuser_delivery_tariff
    BEFORE INSERT OR UPDATE ON public.stores
    FOR EACH ROW EXECUTE FUNCTION public.apply_iuser_delivery_tariff();

-- Quando o admin muda a tarifa da moto, as lojas com entregador iUser acompanham.
CREATE OR REPLACE FUNCTION public.resync_iuser_delivery_stores()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.vehicle_kind = 'moto' THEN
        UPDATE public.stores SET iuser_delivery_enabled = true WHERE iuser_delivery_enabled;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_tariffs_resync_iuser_delivery ON public.platform_tariffs;
CREATE TRIGGER platform_tariffs_resync_iuser_delivery
    AFTER INSERT OR UPDATE ON public.platform_tariffs
    FOR EACH ROW EXECUTE FUNCTION public.resync_iuser_delivery_stores();

-- Lojas que já usavam o entregador iUser passam a seguir a tarifa.
UPDATE public.stores SET iuser_delivery_enabled = true WHERE iuser_delivery_enabled;
