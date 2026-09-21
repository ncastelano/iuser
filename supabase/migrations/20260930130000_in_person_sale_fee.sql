-- Venda presencial (pedido sem comprador logado) também consome R$ 0,50 do
-- pós-pago, com tipo próprio no extrato, e é travada quando a dívida chega a
-- R$ 50 — igual às vendas online.
ALTER TABLE public.driver_postpaid_charges DROP CONSTRAINT IF EXISTS driver_postpaid_charges_type_check;
ALTER TABLE public.driver_postpaid_charges ADD CONSTRAINT driver_postpaid_charges_type_check
    CHECK (type IN ('ride_fee', 'service_fee', 'order_fee', 'in_person_fee', 'product_fee', 'publication_fee',
                    'schedule_activation_fee', 'appointment_fee', 'payment'));
CREATE UNIQUE INDEX IF NOT EXISTS driver_postpaid_in_person_fee_dedupe_idx
    ON public.driver_postpaid_charges (order_id) WHERE type = 'in_person_fee';

CREATE OR REPLACE FUNCTION public.accrue_postpaid_order_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner uuid;
BEGIN
    IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
        IF v_owner IS NOT NULL AND public.is_postpaid_user(v_owner) THEN
            IF NEW.buyer_id IS NULL THEN
                INSERT INTO public.driver_postpaid_charges (driver_id, order_id, type, amount)
                VALUES (v_owner, NEW.id, 'in_person_fee', 0.50)
                ON CONFLICT (order_id) WHERE type = 'in_person_fee' DO NOTHING;
            ELSE
                INSERT INTO public.driver_postpaid_charges (driver_id, order_id, type, amount)
                VALUES (v_owner, NEW.id, 'order_fee', 0.50)
                ON CONFLICT (order_id) WHERE type = 'order_fee' DO NOTHING;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.block_orders_for_store_in_debt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner uuid;
BEGIN
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
    IF v_owner IS NOT NULL AND public.get_driver_postpaid_debt(v_owner) >= 50 THEN
        IF NEW.buyer_id IS NULL THEN
            RAISE EXCEPTION 'Sua dívida do pós-pago chegou a R$ 50. Quite pra registrar vendas presenciais.';
        END IF;
        RAISE EXCEPTION 'Esta loja está temporariamente sem receber novos pedidos.';
    END IF;
    RETURN NEW;
END; $$;
