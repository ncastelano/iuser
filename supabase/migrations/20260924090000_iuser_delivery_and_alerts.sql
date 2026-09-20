-- Entrega iUser: a loja chama um motorista da plataforma pra levar o pedido.
-- O pedido vira uma corrida de objeto (ride_requests) com frete já definido.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS iuser_delivery_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.ride_requests
    ADD COLUMN IF NOT EXISTS offered_price NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
-- Um pedido só tem uma corrida ativa por vez (cancelada libera chamar de novo).
CREATE UNIQUE INDEX IF NOT EXISTS ride_requests_order_active_idx
    ON public.ride_requests (order_id) WHERE order_id IS NOT NULL AND status <> 'cancelled';

-- Som do alerta de novas corridas (o motorista pode silenciar).
ALTER TABLE public.driver_pricing ADD COLUMN IF NOT EXISTS alert_sound_enabled BOOLEAN NOT NULL DEFAULT true;

-- A loja pode ter várias entregas iUser ao mesmo tempo: a trava de "um
-- pedido ativo por pessoa" continua valendo só pra corridas comuns.
DROP INDEX IF EXISTS public.ride_requests_one_active_per_requester;
CREATE UNIQUE INDEX IF NOT EXISTS ride_requests_one_active_per_requester
    ON public.ride_requests (requester_id)
    WHERE status IN ('pending', 'accepted') AND order_id IS NULL;

-- Entrega de loja tem frete fixo: o primeiro motorista que aceitar o frete
-- oferecido já fica com a corrida, sem a loja precisar escolher candidato.
CREATE OR REPLACE FUNCTION public.auto_accept_store_delivery_application()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_offered numeric;
    v_order uuid;
    v_updated integer;
BEGIN
    SELECT offered_price, order_id INTO v_offered, v_order FROM public.ride_requests WHERE id = NEW.ride_request_id;
    IF v_order IS NOT NULL AND v_offered IS NOT NULL AND NEW.proposed_price = v_offered THEN
        UPDATE public.ride_requests
        SET status = 'accepted', driver_id = NEW.applicant_id
        WHERE id = NEW.ride_request_id AND status = 'pending';
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated > 0 THEN
            UPDATE public.ride_applications SET status = 'accepted' WHERE id = NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ride_applications_auto_accept_store_delivery ON public.ride_applications;
CREATE TRIGGER ride_applications_auto_accept_store_delivery
    AFTER INSERT ON public.ride_applications
    FOR EACH ROW EXECUTE FUNCTION public.auto_accept_store_delivery_application();
