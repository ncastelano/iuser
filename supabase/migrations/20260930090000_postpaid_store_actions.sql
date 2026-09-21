-- Pós-pago para lojas: cada produto novo, publicação nova, ativação da agenda
-- e agendamento recebido soma R$ 0,50 na dívida do dono da loja (só quem está
-- no plano pós-pago é cobrado). Tudo por trigger, sem depender do cliente.

ALTER TABLE public.driver_postpaid_charges DROP CONSTRAINT IF EXISTS driver_postpaid_charges_type_check;
ALTER TABLE public.driver_postpaid_charges ADD CONSTRAINT driver_postpaid_charges_type_check
    CHECK (type IN ('ride_fee', 'service_fee', 'order_fee', 'product_fee', 'publication_fee',
                    'schedule_activation_fee', 'appointment_fee', 'payment'));

ALTER TABLE public.driver_postpaid_charges
    ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS driver_postpaid_product_fee_dedupe_idx
    ON public.driver_postpaid_charges (product_id) WHERE type IN ('product_fee', 'publication_fee');
CREATE UNIQUE INDEX IF NOT EXISTS driver_postpaid_appointment_fee_dedupe_idx
    ON public.driver_postpaid_charges (appointment_id) WHERE type = 'appointment_fee';
CREATE UNIQUE INDEX IF NOT EXISTS driver_postpaid_schedule_activation_dedupe_idx
    ON public.driver_postpaid_charges (store_id) WHERE type = 'schedule_activation_fee';

-- Produto ou publicação nova (publicação é um produto com listing_type='publication').
CREATE OR REPLACE FUNCTION public.accrue_postpaid_product_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.store_id IS NULL THEN RETURN NEW; END IF;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
    IF v_owner IS NOT NULL AND public.is_postpaid_user(v_owner) THEN
        INSERT INTO public.driver_postpaid_charges (driver_id, product_id, type, amount)
        VALUES (v_owner, NEW.id,
                CASE WHEN NEW.listing_type = 'publication' THEN 'publication_fee' ELSE 'product_fee' END,
                0.50)
        ON CONFLICT (product_id) WHERE type IN ('product_fee', 'publication_fee') DO NOTHING;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS products_accrue_postpaid_fee ON public.products;
CREATE TRIGGER products_accrue_postpaid_fee AFTER INSERT ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.accrue_postpaid_product_fee();

-- Agendamento feito por um cliente na loja (direction 'outgoing').
CREATE OR REPLACE FUNCTION public.accrue_postpaid_appointment_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.store_id IS NULL OR NEW.direction IS DISTINCT FROM 'outgoing' THEN RETURN NEW; END IF;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
    IF v_owner IS NOT NULL AND NEW.customer_id IS DISTINCT FROM v_owner AND public.is_postpaid_user(v_owner) THEN
        INSERT INTO public.driver_postpaid_charges (driver_id, appointment_id, type, amount)
        VALUES (v_owner, NEW.id, 'appointment_fee', 0.50)
        ON CONFLICT (appointment_id) WHERE type = 'appointment_fee' DO NOTHING;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS appointments_accrue_postpaid_fee ON public.appointments;
CREATE TRIGGER appointments_accrue_postpaid_fee AFTER INSERT ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.accrue_postpaid_appointment_fee();

-- Ativar a agenda: cobra uma única vez por loja. O carimbo scheduling_activated_at
-- é controlado só aqui (o valor que o cliente mandar é ignorado), então
-- desligar e ligar de novo não cobra outra vez e não dá pra burlar.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS scheduling_activated_at TIMESTAMPTZ;
UPDATE public.stores SET scheduling_activated_at = now()
    WHERE allow_scheduling = true AND scheduling_activated_at IS NULL;

CREATE OR REPLACE FUNCTION public.charge_store_scheduling_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    NEW.scheduling_activated_at := OLD.scheduling_activated_at;

    IF NEW.allow_scheduling IS TRUE AND NEW.scheduling_activated_at IS NULL THEN
        IF NEW.owner_id IS NOT NULL AND public.is_postpaid_user(NEW.owner_id) THEN
            IF public.get_driver_postpaid_debt(NEW.owner_id) >= 50 THEN
                RAISE EXCEPTION 'Sua dívida do pós-pago chegou a R$ 50. Quite pra ativar a agenda.';
            END IF;
            INSERT INTO public.driver_postpaid_charges (driver_id, store_id, type, amount)
            VALUES (NEW.owner_id, NEW.id, 'schedule_activation_fee', 0.50)
            ON CONFLICT (store_id) WHERE type = 'schedule_activation_fee' DO NOTHING;
        END IF;
        NEW.scheduling_activated_at := now();
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS stores_charge_scheduling_activation ON public.stores;
CREATE TRIGGER stores_charge_scheduling_activation BEFORE UPDATE OF allow_scheduling, scheduling_activated_at ON public.stores
    FOR EACH ROW EXECUTE FUNCTION public.charge_store_scheduling_activation();
