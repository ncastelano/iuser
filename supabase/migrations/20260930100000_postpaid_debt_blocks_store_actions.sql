-- Dívida do pós-pago >= R$ 50 trava tudo que gera cobrança na loja: produto,
-- publicação, ativar a agenda e receber agendamentos. Só destrava quitando.

CREATE OR REPLACE FUNCTION public.block_product_for_store_in_debt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.store_id IS NULL THEN RETURN NEW; END IF;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
    IF v_owner IS NOT NULL AND public.get_driver_postpaid_debt(v_owner) >= 50 THEN
        RAISE EXCEPTION 'Sua dívida do pós-pago chegou a R$ 50. Quite pra cadastrar produtos e publicações.';
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS products_block_store_in_debt ON public.products;
CREATE TRIGGER products_block_store_in_debt BEFORE INSERT ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.block_product_for_store_in_debt();

-- Cliente não consegue agendar numa loja cujo dono está travado por dívida.
CREATE OR REPLACE FUNCTION public.block_appointment_for_store_in_debt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.store_id IS NULL OR NEW.direction IS DISTINCT FROM 'outgoing' THEN RETURN NEW; END IF;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
    IF v_owner IS NOT NULL AND NEW.customer_id IS DISTINCT FROM v_owner
       AND public.get_driver_postpaid_debt(v_owner) >= 50 THEN
        RAISE EXCEPTION 'Esta loja está temporariamente sem receber agendamentos.';
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS appointments_block_store_in_debt ON public.appointments;
CREATE TRIGGER appointments_block_store_in_debt BEFORE INSERT ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.block_appointment_for_store_in_debt();

-- Ativar (ou reativar) a agenda também é bloqueado, não só a primeira vez.
CREATE OR REPLACE FUNCTION public.charge_store_scheduling_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    NEW.scheduling_activated_at := OLD.scheduling_activated_at;

    IF NEW.allow_scheduling IS TRUE AND OLD.allow_scheduling IS NOT TRUE THEN
        IF NEW.owner_id IS NOT NULL AND public.get_driver_postpaid_debt(NEW.owner_id) >= 50 THEN
            RAISE EXCEPTION 'Sua dívida do pós-pago chegou a R$ 50. Quite pra ativar a agenda.';
        END IF;
    END IF;

    IF NEW.allow_scheduling IS TRUE AND NEW.scheduling_activated_at IS NULL THEN
        IF NEW.owner_id IS NOT NULL AND public.is_postpaid_user(NEW.owner_id) THEN
            INSERT INTO public.driver_postpaid_charges (driver_id, store_id, type, amount)
            VALUES (NEW.owner_id, NEW.id, 'schedule_activation_fee', 0.50)
            ON CONFLICT (store_id) WHERE type = 'schedule_activation_fee' DO NOTHING;
        END IF;
        NEW.scheduling_activated_at := now();
    END IF;
    RETURN NEW;
END; $$;
