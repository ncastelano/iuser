-- Plano "Pós-pago": sem mensalidade, cobra R$ 0,50 por serviço oferecido
-- (corrida finalizada, pedido de serviço aceito, pedido de loja pago). O
-- valor acumula numa dívida por conta; ao chegar em R$ 50 a pessoa fica sem
-- aceitar novos serviços/pedidos até quitar via Pix. Só quem tem o plano
-- pós-pago é cobrado por serviço — quem paga plano mensal não.

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_source_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_source_check
    CHECK (source IN ('asaas', 'admin_grant', 'code', 'leader_grant', 'postpaid'));

-- O plano pós-pago não tem mensalidade, então o preço precisa aceitar zero.
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_price_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_price_check CHECK (price >= 0);

-- Plano pós-pago entra no lugar do Beta na vitrine de /planos.
INSERT INTO public.plans (code, name, price, grants_driver, grants_provider, grants_store, is_active, description, billing_cycle, features)
VALUES (
    'pos_pago',
    'Pós-pago',
    0.00,
    true, true, true,
    true,
    'Sem mensalidade: você paga R$ 0,50 por serviço que oferecer (corrida, serviço ou pedido de loja).',
    'MONTHLY',
    ARRAY['Sem mensalidade', 'R$ 0,50 por serviço oferecido', 'Libera motorista, prestador e loja', 'Paga via Pix ao acumular R$ 50']
)
ON CONFLICT (code) DO NOTHING;
UPDATE public.plans SET is_active = false WHERE code = 'beta';

-- Um CPF/CNPJ e um aparelho só podem estar ligados a UMA conta no plano
-- pós-pago — impede criar várias contas pra fugir da dívida.
CREATE TABLE IF NOT EXISTS public.postpaid_identities (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    cpf_cnpj TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.postpaid_identities ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_postpaid_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions s
        JOIN public.plans p ON p.id = s.plan_id
        WHERE s.user_id = p_user_id AND p.code = 'pos_pago'
          AND s.status = 'active' AND s.current_period_end > now()
    );
$$;
REVOKE ALL ON FUNCTION public.is_postpaid_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_postpaid_user(uuid) TO authenticated;

-- Ledger de dívida ganha os outros tipos de serviço.
ALTER TABLE public.driver_postpaid_charges DROP CONSTRAINT IF EXISTS driver_postpaid_charges_type_check;
ALTER TABLE public.driver_postpaid_charges ADD CONSTRAINT driver_postpaid_charges_type_check
    CHECK (type IN ('ride_fee', 'service_fee', 'order_fee', 'payment'));
ALTER TABLE public.driver_postpaid_charges
    ADD COLUMN IF NOT EXISTS service_application_id UUID REFERENCES public.service_applications(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS driver_postpaid_service_fee_dedupe_idx
    ON public.driver_postpaid_charges (service_application_id) WHERE type = 'service_fee';
CREATE UNIQUE INDEX IF NOT EXISTS driver_postpaid_order_fee_dedupe_idx
    ON public.driver_postpaid_charges (order_id) WHERE type = 'order_fee';

-- Corrida: passa a cobrar só quem está no plano pós-pago.
CREATE OR REPLACE FUNCTION public.accrue_driver_postpaid_ride_fee()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
       AND NEW.driver_id IS NOT NULL AND public.is_postpaid_user(NEW.driver_id) THEN
        INSERT INTO public.driver_postpaid_charges (driver_id, ride_request_id, type, amount)
        VALUES (NEW.driver_id, NEW.id, 'ride_fee', 0.50)
        ON CONFLICT (ride_request_id) WHERE type = 'ride_fee' DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

-- Pedido de serviço: cobra o prestador quando o cliente aceita a candidatura.
CREATE OR REPLACE FUNCTION public.accrue_postpaid_service_fee()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted'
       AND public.is_postpaid_user(NEW.applicant_id) THEN
        INSERT INTO public.driver_postpaid_charges (driver_id, service_application_id, type, amount)
        VALUES (NEW.applicant_id, NEW.id, 'service_fee', 0.50)
        ON CONFLICT (service_application_id) WHERE type = 'service_fee' DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS service_applications_accrue_postpaid_fee ON public.service_applications;
CREATE TRIGGER service_applications_accrue_postpaid_fee
    AFTER UPDATE OF status ON public.service_applications
    FOR EACH ROW EXECUTE FUNCTION public.accrue_postpaid_service_fee();

-- Pedido de loja: cobra o dono da loja quando o pedido vira "paid".
CREATE OR REPLACE FUNCTION public.accrue_postpaid_order_fee()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_owner uuid;
BEGIN
    IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
        IF v_owner IS NOT NULL AND public.is_postpaid_user(v_owner) THEN
            INSERT INTO public.driver_postpaid_charges (driver_id, order_id, type, amount)
            VALUES (v_owner, NEW.id, 'order_fee', 0.50)
            ON CONFLICT (order_id) WHERE type = 'order_fee' DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_accrue_postpaid_fee ON public.orders;
CREATE TRIGGER orders_accrue_postpaid_fee
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.accrue_postpaid_order_fee();

-- Loja devendo R$ 50 ou mais não recebe novos pedidos online (venda
-- presencial, sem comprador logado, segue liberada).
CREATE OR REPLACE FUNCTION public.block_orders_for_store_in_debt()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_owner uuid;
BEGIN
    IF NEW.buyer_id IS NOT NULL THEN
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
        IF v_owner IS NOT NULL AND public.get_driver_postpaid_debt(v_owner) >= 50 THEN
            RAISE EXCEPTION 'Esta loja está temporariamente sem receber novos pedidos.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_block_store_in_debt ON public.orders;
CREATE TRIGGER orders_block_store_in_debt
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.block_orders_for_store_in_debt();

-- Prestador devendo R$ 50 ou mais não se candidata a novos serviços.
DROP POLICY IF EXISTS "Candidato se candidata a pedido de outra pessoa" ON public.service_applications;
CREATE POLICY "Candidato se candidata a pedido de outra pessoa" ON public.service_applications FOR INSERT
    WITH CHECK (
        auth.uid() = applicant_id
        AND EXISTS (SELECT 1 FROM public.service_requests sr WHERE sr.id = service_request_id AND sr.requester_id <> auth.uid())
        AND (SELECT has_provider FROM public.get_active_plan_grants(auth.uid()))
        AND public.get_driver_postpaid_debt(auth.uid()) < 50
    );
