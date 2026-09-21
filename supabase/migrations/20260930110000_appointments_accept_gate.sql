-- A loja SEMPRE pode receber agendamentos. Quem fica travado é o dono na hora
-- de ACEITAR: com dívida do pós-pago >= R$ 50 ele não confirma até quitar. A
-- cobrança de R$ 0,50 passa a valer no aceite (não mais na criação do pedido).

DROP TRIGGER IF EXISTS appointments_block_store_in_debt ON public.appointments;
DROP TRIGGER IF EXISTS appointments_accrue_postpaid_fee ON public.appointments;

-- Aceite do dono (status 'confirmed') de um agendamento feito por cliente.
CREATE OR REPLACE FUNCTION public.gate_appointment_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed'
       AND NEW.store_id IS NOT NULL AND NEW.direction = 'outgoing' THEN
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
        IF v_owner IS NOT NULL AND NEW.customer_id IS DISTINCT FROM v_owner
           AND (auth.uid() IS NULL OR auth.uid() = v_owner)
           AND public.get_driver_postpaid_debt(v_owner) >= 50 THEN
            RAISE EXCEPTION 'Você está com R$ 50 ou mais em aberto no pós-pago. Quite a dívida pra aceitar agendamentos.';
        END IF;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS appointments_gate_accept ON public.appointments;
CREATE TRIGGER appointments_gate_accept BEFORE UPDATE OF status ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.gate_appointment_accept();

CREATE OR REPLACE FUNCTION public.accrue_postpaid_appointment_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed'
       AND NEW.store_id IS NOT NULL AND NEW.direction = 'outgoing' THEN
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
        IF v_owner IS NOT NULL AND NEW.customer_id IS DISTINCT FROM v_owner AND public.is_postpaid_user(v_owner) THEN
            INSERT INTO public.driver_postpaid_charges (driver_id, appointment_id, type, amount)
            VALUES (v_owner, NEW.id, 'appointment_fee', 0.50)
            ON CONFLICT (appointment_id) WHERE type = 'appointment_fee' DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS appointments_accrue_postpaid_fee_on_accept ON public.appointments;
CREATE TRIGGER appointments_accrue_postpaid_fee_on_accept AFTER UPDATE OF status ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.accrue_postpaid_appointment_fee();
