-- As mesmas cobranças do pós-pago que valem pra loja passam a valer pro PERFIL:
-- produto/publicação do perfil (products com store_id nulo), ativar a agenda do
-- perfil e agendamento recebido pelo perfil. A dívida é uma só por conta (a do
-- dono), então perfil e lojas somam no mesmo saldo.

-- ---- Produto / publicação: dono = dono da loja, ou o próprio perfil ----
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
                0.50)
        ON CONFLICT (product_id) WHERE type IN ('product_fee', 'publication_fee') DO NOTHING;
    END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.block_product_for_store_in_debt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.store_id IS NOT NULL THEN
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
    ELSE
        v_owner := NEW.owner_id;
    END IF;
    IF v_owner IS NOT NULL AND public.get_driver_postpaid_debt(v_owner) >= 50 THEN
        RAISE EXCEPTION 'Sua dívida do pós-pago chegou a R$ 50. Quite pra cadastrar produtos e publicações.';
    END IF;
    RETURN NEW;
END; $$;

-- ---- Agenda do perfil: cobra uma vez, trava com dívida ----
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS scheduling_activated_at TIMESTAMPTZ;
UPDATE public.profiles SET scheduling_activated_at = now()
    WHERE allow_scheduling = true AND scheduling_activated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS driver_postpaid_profile_schedule_activation_idx
    ON public.driver_postpaid_charges (driver_id)
    WHERE type = 'schedule_activation_fee' AND store_id IS NULL;

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
            VALUES (NEW.id, 'schedule_activation_fee', 0.50)
            ON CONFLICT (driver_id) WHERE type = 'schedule_activation_fee' AND store_id IS NULL DO NOTHING;
        END IF;
        NEW.scheduling_activated_at := now();
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profiles_charge_scheduling_activation ON public.profiles;
CREATE TRIGGER profiles_charge_scheduling_activation BEFORE UPDATE OF allow_scheduling, scheduling_activated_at ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.charge_profile_scheduling_activation();

-- ---- Agendamento recebido: loja OU perfil ----
-- Agendamento "de verdade" num perfil: sem loja, feito por outra pessoa
-- (customer <> provider) na direção 'outgoing'. Convites entre pessoas (rows
-- 'incoming' e a cópia de quem convida, com customer = provider) não contam.
CREATE OR REPLACE FUNCTION public.gate_appointment_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' AND NEW.direction = 'outgoing' THEN
        IF NEW.store_id IS NOT NULL THEN
            SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
        ELSE
            v_owner := NEW.provider_profile_id;
        END IF;
        IF v_owner IS NOT NULL AND NEW.customer_id IS DISTINCT FROM v_owner
           AND (auth.uid() IS NULL OR auth.uid() = v_owner)
           AND public.get_driver_postpaid_debt(v_owner) >= 50 THEN
            RAISE EXCEPTION 'Você está com R$ 50 ou mais em aberto no pós-pago. Quite a dívida pra aceitar agendamentos.';
        END IF;
    END IF;
    RETURN NEW;
END; $$;

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
            VALUES (v_owner, NEW.id, 'appointment_fee', 0.50)
            ON CONFLICT (appointment_id) WHERE type = 'appointment_fee' DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END; $$;
