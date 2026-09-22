-- Simplifica a vitrine pra só 2 planos (Pré-pago, Pós-pago) e torna o preço
-- por serviço do pós-pago editável (hoje era um literal 0.50 cravado em 7
-- funções de trigger diferentes). Não cancela nem migra à força quem já
-- assina motorista/prestador/loja/recrutador/combo/beta/motorista_beta — só
-- para de vender (is_active=false); get_active_plan_grants nunca olha pra
-- is_active, só pra status/validade da assinatura, então quem já paga
-- continua liberado exatamente como hoje.

-- ===== PREÇO POR TIPO DE SERVIÇO DO PÓS-PAGO =====
-- base_price é a referência usada só pra policiar o teto (postpaid_price não
-- pode passar de 3x ela) — ninguém paga base_price diretamente, o pré-pago é
-- mensalidade fixa, sem cobrança por evento.
CREATE TABLE IF NOT EXISTS public.service_pricing (
    service_type TEXT PRIMARY KEY CHECK (service_type IN (
        'ride_fee', 'service_fee', 'order_fee', 'in_person_fee',
        'product_fee', 'publication_fee', 'schedule_activation_fee', 'appointment_fee'
    )),
    label TEXT NOT NULL,
    base_price NUMERIC(10, 2) NOT NULL DEFAULT 0.50 CHECK (base_price > 0),
    postpaid_price NUMERIC(10, 2) NOT NULL DEFAULT 0.50 CHECK (postpaid_price > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT service_pricing_postpaid_cap CHECK (postpaid_price <= base_price * 3)
);

INSERT INTO public.service_pricing (service_type, label, base_price, postpaid_price) VALUES
    ('ride_fee', 'Corrida finalizada', 0.50, 0.50),
    ('service_fee', 'Candidatura de serviço aceita', 0.50, 0.50),
    ('order_fee', 'Pedido de loja pago (comprador logado)', 0.50, 0.50),
    ('in_person_fee', 'Venda presencial na loja', 0.50, 0.50),
    ('product_fee', 'Produto novo cadastrado', 0.50, 0.50),
    ('publication_fee', 'Publicação nova', 0.50, 0.50),
    ('schedule_activation_fee', 'Ativar agenda (única vez)', 0.50, 0.50),
    ('appointment_fee', 'Agendamento confirmado', 0.50, 0.50)
ON CONFLICT (service_type) DO NOTHING;

ALTER TABLE public.service_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Qualquer um pode ver os preços do pós-pago" ON public.service_pricing FOR SELECT USING (true);
-- Sem policy de INSERT/UPDATE pra authenticated: só a rota admin
-- (/api/admin/service-pricing/update, service role) escreve aqui — mesmo
-- padrão de public.plans.

-- ===== TRIGGERS: trocam o literal 0.50 por uma leitura de service_pricing =====
-- Corpo idêntico ao que já estava em produção (20260923100000), só o valor
-- do INSERT muda.
CREATE OR REPLACE FUNCTION public.accrue_driver_postpaid_ride_fee()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
       AND NEW.driver_id IS NOT NULL AND public.is_postpaid_user(NEW.driver_id) THEN
        INSERT INTO public.driver_postpaid_charges (driver_id, ride_request_id, type, amount)
        VALUES (NEW.driver_id, NEW.id, 'ride_fee', (SELECT postpaid_price FROM public.service_pricing WHERE service_type = 'ride_fee'))
        ON CONFLICT (ride_request_id) WHERE type = 'ride_fee' DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.accrue_postpaid_service_fee()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted'
       AND public.is_postpaid_user(NEW.applicant_id) THEN
        INSERT INTO public.driver_postpaid_charges (driver_id, service_application_id, type, amount)
        VALUES (NEW.applicant_id, NEW.id, 'service_fee', (SELECT postpaid_price FROM public.service_pricing WHERE service_type = 'service_fee'))
        ON CONFLICT (service_application_id) WHERE type = 'service_fee' DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

-- Corpo idêntico ao que já estava em produção (20260930130000: order_fee +
-- in_person_fee), só os valores dos dois INSERTs mudam.
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
                VALUES (v_owner, NEW.id, 'in_person_fee', (SELECT postpaid_price FROM public.service_pricing WHERE service_type = 'in_person_fee'))
                ON CONFLICT (order_id) WHERE type = 'in_person_fee' DO NOTHING;
            ELSE
                INSERT INTO public.driver_postpaid_charges (driver_id, order_id, type, amount)
                VALUES (v_owner, NEW.id, 'order_fee', (SELECT postpaid_price FROM public.service_pricing WHERE service_type = 'order_fee'))
                ON CONFLICT (order_id) WHERE type = 'order_fee' DO NOTHING;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END; $$;

-- Corpo idêntico ao que já estava em produção (20260930140000: loja OU
-- perfil), só o valor do INSERT muda.
CREATE OR REPLACE FUNCTION public.accrue_postpaid_product_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.store_id IS NOT NULL THEN
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
    ELSE
        v_owner := NEW.owner_id;
    END IF;
    IF v_owner IS NOT NULL AND public.is_postpaid_user(v_owner) THEN
        INSERT INTO public.driver_postpaid_charges (driver_id, product_id, type, amount)
        VALUES (v_owner, NEW.id,
                CASE WHEN NEW.listing_type = 'publication' THEN 'publication_fee' ELSE 'product_fee' END,
                (SELECT postpaid_price FROM public.service_pricing
                 WHERE service_type = CASE WHEN NEW.listing_type = 'publication' THEN 'publication_fee' ELSE 'product_fee' END))
        ON CONFLICT (product_id) WHERE type IN ('product_fee', 'publication_fee') DO NOTHING;
    END IF;
    RETURN NEW;
END; $$;

-- Corpo idêntico ao que já estava em produção (20260930090000), só o valor
-- do INSERT muda.
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
            VALUES (NEW.owner_id, NEW.id, 'schedule_activation_fee', (SELECT postpaid_price FROM public.service_pricing WHERE service_type = 'schedule_activation_fee'))
            ON CONFLICT (store_id) WHERE type = 'schedule_activation_fee' DO NOTHING;
        END IF;
        NEW.scheduling_activated_at := now();
    END IF;
    RETURN NEW;
END; $$;

-- Corpo idêntico ao que já estava em produção (20260930140000), só o valor
-- do INSERT muda.
CREATE OR REPLACE FUNCTION public.charge_profile_scheduling_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    NEW.scheduling_activated_at := OLD.scheduling_activated_at;

    IF NEW.allow_scheduling IS TRUE AND OLD.allow_scheduling IS NOT TRUE THEN
        IF public.get_driver_postpaid_debt(NEW.id) >= 50 THEN
            RAISE EXCEPTION 'Sua dívida do pós-pago chegou a R$ 50. Quite pra ativar a agenda.';
        END IF;
    END IF;

    IF NEW.allow_scheduling IS TRUE AND NEW.scheduling_activated_at IS NULL THEN
        IF public.is_postpaid_user(NEW.id) THEN
            INSERT INTO public.driver_postpaid_charges (driver_id, type, amount)
            VALUES (NEW.id, 'schedule_activation_fee', (SELECT postpaid_price FROM public.service_pricing WHERE service_type = 'schedule_activation_fee'))
            ON CONFLICT (driver_id) WHERE type = 'schedule_activation_fee' AND store_id IS NULL DO NOTHING;
        END IF;
        NEW.scheduling_activated_at := now();
    END IF;
    RETURN NEW;
END; $$;

-- Corpo idêntico ao que já estava em produção (20260930140000: loja OU
-- perfil), só o valor do INSERT muda.
CREATE OR REPLACE FUNCTION public.accrue_postpaid_appointment_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' AND NEW.direction = 'outgoing' THEN
        IF NEW.store_id IS NOT NULL THEN
            SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
        ELSE
            v_owner := NEW.provider_profile_id;
        END IF;
        IF v_owner IS NOT NULL AND NEW.customer_id IS DISTINCT FROM v_owner AND public.is_postpaid_user(v_owner) THEN
            INSERT INTO public.driver_postpaid_charges (driver_id, appointment_id, type, amount)
            VALUES (v_owner, NEW.id, 'appointment_fee', (SELECT postpaid_price FROM public.service_pricing WHERE service_type = 'appointment_fee'))
            ON CONFLICT (appointment_id) WHERE type = 'appointment_fee' DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END; $$;

-- ===== CONSOLIDA A VITRINE: só Pré-pago e Pós-pago =====
UPDATE public.plans SET is_active = false
    WHERE code IN ('motorista', 'prestador', 'loja', 'recrutador', 'combo', 'motorista_beta', 'beta');

INSERT INTO public.plans (code, name, price, grants_driver, grants_provider, grants_store, grants_recruiter, is_active, description, billing_cycle, features)
VALUES (
    'pre_pago',
    'Pré-pago',
    160.00,
    true, true, true, true,
    true,
    'Mensalidade única — sem cobrança por corrida, serviço ou pedido. Libera motorista, prestador, loja e recrutador, tudo junto.',
    'MONTHLY',
    ARRAY[
        'Sem cobrança por serviço — use à vontade',
        'Libera motorista, prestador, loja e recrutador',
        'Renovação mensal automática'
    ]
)
ON CONFLICT (code) DO NOTHING;
