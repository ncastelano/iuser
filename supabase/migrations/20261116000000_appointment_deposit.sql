-- Entrada (sinal) no agendamento da loja — OPCIONAL, escolhida pela loja; vale na 2.0 e na 3.0.
--   stores.deposit_mode  none | percent (1–100 % do valor dos serviços; 100 = valor total) | fixed (R$ por agendamento)
--   stores.deposit_value o número do modo; stores.deposit_policy o texto de cancelamento/devolução (a loja decide; o iUser só registra)
-- O iUser NÃO movimenta o dinheiro (mesmo modelo da entrega): o cliente paga por Pix na chave da loja e avisa; a loja confirma que
-- recebeu e o agendamento fica confirmado. Enquanto a entrada não é confirmada o horário fica reservado por 30 min e depois o
-- agendamento é cancelado sozinho e o horário volta a ficar livre.
--   appointments.deposit_status  none | awaiting | reported (cliente disse que pagou) | paid (loja confirmou) | refunded | expired
-- O valor da entrada é calculado AQUI (gatilho), a partir do preço dos serviços no banco (service_items) — nunca do que o app mandar —
-- e as colunas deposit_* só mudam pelas funções abaixo (o dono/cliente têm UPDATE em appointments e poderiam marcar "pago" direto).
-- Dados públicos da página da loja (modo, valor, política): entram nas três listas de colunas públicas.
-- A chave Pix continua PRIVADA (stores.pix_key): o cliente só a recebe por get_appointment_deposit, do próprio agendamento.

DO $$
DECLARE
    deposit_cols text[] := ARRAY['deposit_mode', 'deposit_value', 'deposit_policy'];
    cols text;
BEGIN
    ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS deposit_mode text NOT NULL DEFAULT 'none';
    ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS deposit_value numeric(10, 2) NOT NULL DEFAULT 0;
    ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS deposit_policy text;
    ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_deposit_check;
    ALTER TABLE public.stores ADD CONSTRAINT stores_deposit_check CHECK (
        (deposit_mode = 'none')
        OR (deposit_mode = 'percent' AND deposit_value BETWEEN 1 AND 100)
        OR (deposit_mode = 'fixed' AND deposit_value > 0 AND deposit_value <= 100000)
    );
    ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_deposit_policy_check;
    ALTER TABLE public.stores ADD CONSTRAINT stores_deposit_policy_check CHECK (deposit_policy IS NULL OR char_length(deposit_policy) <= 300);
    SELECT string_agg(quote_ident(x), ', ') INTO cols FROM unnest(deposit_cols) x;
    EXECUTE format('GRANT SELECT (%s) ON public.stores TO anon, authenticated', cols);
    EXECUTE format('GRANT UPDATE (%s) ON public.stores TO authenticated', cols);
END $$;

-- Só cobra entrada quem tem chave Pix cadastrada (senão o cliente não teria para quem pagar)
CREATE OR REPLACE FUNCTION public.guard_store_deposit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.deposit_mode <> 'none' AND COALESCE(btrim(NEW.pix_key), '') = '' THEN
        RAISE EXCEPTION 'Cadastre a chave Pix da loja para cobrar entrada.';
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS stores_guard_deposit ON public.stores;
CREATE TRIGGER stores_guard_deposit BEFORE INSERT OR UPDATE OF deposit_mode, pix_key ON public.stores
    FOR EACH ROW EXECUTE FUNCTION public.guard_store_deposit();

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS service_items jsonb,
    ADD COLUMN IF NOT EXISTS deposit_amount numeric(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deposit_status text NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS deposit_due_at timestamptz,
    ADD COLUMN IF NOT EXISTS deposit_reported_at timestamptz,
    ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz;
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_deposit_status_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_deposit_status_check CHECK (deposit_status IN ('none', 'awaiting', 'reported', 'paid', 'refunded', 'expired'));

-- Ao marcar: calcula a entrada pelo preço dos serviços no banco e deixa o horário reservado por 30 min
CREATE OR REPLACE FUNCTION public.appointment_deposit_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_mode text; v_value numeric; v_owner uuid;
    v_total numeric := 0; v_amount numeric := 0;
BEGIN
    NEW.deposit_amount := 0; NEW.deposit_status := 'none';
    NEW.deposit_due_at := NULL; NEW.deposit_reported_at := NULL; NEW.deposit_paid_at := NULL;
    IF NEW.store_id IS NULL OR NEW.direction IS DISTINCT FROM 'outgoing' THEN RETURN NEW; END IF;

    SELECT deposit_mode, deposit_value, owner_id INTO v_mode, v_value, v_owner FROM public.stores WHERE id = NEW.store_id;
    IF v_mode IS NULL OR v_mode = 'none' OR NEW.customer_id IS NOT DISTINCT FROM v_owner THEN RETURN NEW; END IF;

    IF NEW.service_items IS NOT NULL AND jsonb_typeof(NEW.service_items) = 'array' THEN
        SELECT COALESCE(SUM(p.price * LEAST(GREATEST(COALESCE((i ->> 'quantity')::int, 1), 1), 20)), 0) INTO v_total
        FROM jsonb_array_elements(NEW.service_items) i
        JOIN public.products p ON p.id = (i ->> 'product_id')::uuid AND p.store_id = NEW.store_id AND COALESCE(p.is_active, true);
    END IF;

    IF v_mode = 'percent' THEN
        IF v_total <= 0 THEN
            IF NEW.service_items IS NULL OR jsonb_array_length(COALESCE(NEW.service_items, '[]'::jsonb)) = 0 THEN
                RAISE EXCEPTION 'Escolha o serviço para calcular a entrada. Atualize a página e tente de novo.';
            END IF;
            RETURN NEW; -- serviços sem custo: 0 % de nada
        END IF;
        v_amount := round(v_total * v_value / 100, 2);
    ELSE
        v_amount := v_value;
        IF v_total > 0 AND v_amount > v_total THEN v_amount := v_total; END IF;
    END IF;

    IF v_amount > 0 THEN
        NEW.deposit_amount := v_amount;
        NEW.deposit_status := 'awaiting';
        NEW.deposit_due_at := now() + interval '30 minutes';
        NEW.status := 'pending';
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS appointments_deposit_insert ON public.appointments;
CREATE TRIGGER appointments_deposit_insert BEFORE INSERT ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.appointment_deposit_on_insert();

-- Depois de criado: as colunas da entrada só mudam pelas funções desta migration, e agendamento com entrada pendente não confirma
CREATE OR REPLACE FUNCTION public.appointment_deposit_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF current_setting('app.deposit_rpc', true) IS DISTINCT FROM '1' THEN
        IF NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount
           OR NEW.deposit_status IS DISTINCT FROM OLD.deposit_status
           OR NEW.deposit_due_at IS DISTINCT FROM OLD.deposit_due_at
           OR NEW.deposit_reported_at IS DISTINCT FROM OLD.deposit_reported_at
           OR NEW.deposit_paid_at IS DISTINCT FROM OLD.deposit_paid_at
           OR NEW.service_items IS DISTINCT FROM OLD.service_items THEN
            RAISE EXCEPTION 'A entrada só muda pelas ações do agendamento.';
        END IF;
        IF NEW.status::text = 'confirmed' AND OLD.status::text IS DISTINCT FROM 'confirmed' AND OLD.deposit_status IN ('awaiting', 'reported') THEN
            RAISE EXCEPTION 'Confirme o recebimento da entrada para confirmar o agendamento.';
        END IF;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS appointments_deposit_guard ON public.appointments;
CREATE TRIGGER appointments_deposit_guard BEFORE UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.appointment_deposit_guard();

-- Cliente: "já paguei" (a loja ainda precisa confirmar)
CREATE OR REPLACE FUNCTION public.report_appointment_deposit(p_appointment uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.appointments;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
    SELECT * INTO a FROM public.appointments WHERE id = p_appointment FOR UPDATE;
    IF NOT FOUND OR a.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Agendamento não encontrado'; END IF;
    IF a.deposit_status = 'reported' THEN RETURN 'reported'; END IF;
    IF a.deposit_status <> 'awaiting' THEN RAISE EXCEPTION 'Este agendamento não está aguardando entrada.'; END IF;
    IF a.deposit_due_at IS NOT NULL AND a.deposit_due_at < now() THEN RAISE EXCEPTION 'O prazo para pagar a entrada acabou. Faça um novo agendamento.'; END IF;
    PERFORM set_config('app.deposit_rpc', '1', true);
    UPDATE public.appointments SET deposit_status = 'reported', deposit_reported_at = now(), updated_at = now() WHERE id = a.id;
    PERFORM set_config('app.deposit_rpc', '0', true);
    RETURN 'reported';
END; $$;

-- Loja: "recebi a entrada" — confirma a entrada e o agendamento
CREATE OR REPLACE FUNCTION public.confirm_appointment_deposit(p_appointment uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.appointments;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
    SELECT * INTO a FROM public.appointments WHERE id = p_appointment FOR UPDATE;
    IF NOT FOUND OR a.store_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = a.store_id AND s.owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Agendamento não encontrado';
    END IF;
    IF a.deposit_status = 'paid' THEN RETURN 'paid'; END IF;
    IF a.deposit_status NOT IN ('awaiting', 'reported') THEN RAISE EXCEPTION 'Este agendamento não está aguardando entrada.'; END IF;
    IF a.status::text = 'cancelled' THEN RAISE EXCEPTION 'Este agendamento foi cancelado.'; END IF;
    PERFORM set_config('app.deposit_rpc', '1', true);
    UPDATE public.appointments SET deposit_status = 'paid', deposit_paid_at = now(), deposit_due_at = NULL, status = 'confirmed', updated_at = now() WHERE id = a.id;
    PERFORM set_config('app.deposit_rpc', '0', true);
    RETURN 'paid';
END; $$;

-- Loja: marca que devolveu a entrada (a política é da loja; aqui só fica registrado)
CREATE OR REPLACE FUNCTION public.refund_appointment_deposit(p_appointment uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.appointments;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
    SELECT * INTO a FROM public.appointments WHERE id = p_appointment FOR UPDATE;
    IF NOT FOUND OR a.store_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = a.store_id AND s.owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Agendamento não encontrado';
    END IF;
    IF a.deposit_status = 'refunded' THEN RETURN 'refunded'; END IF;
    IF a.deposit_status NOT IN ('paid', 'reported') THEN RAISE EXCEPTION 'Não há entrada recebida para devolver.'; END IF;
    PERFORM set_config('app.deposit_rpc', '1', true);
    UPDATE public.appointments SET deposit_status = 'refunded', updated_at = now() WHERE id = a.id;
    PERFORM set_config('app.deposit_rpc', '0', true);
    RETURN 'refunded';
END; $$;

-- Para pagar: valor, prazo, política e a chave Pix da loja — só para o cliente do agendamento e para o dono da loja
CREATE OR REPLACE FUNCTION public.get_appointment_deposit(p_appointment uuid)
RETURNS TABLE (deposit_amount numeric, deposit_status text, deposit_due_at timestamptz, appointment_status text, store_name text, policy text, pix_key text, pix_key_type text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
    RETURN QUERY
    SELECT a.deposit_amount, a.deposit_status, a.deposit_due_at, a.status::text, s.name, s.deposit_policy,
           CASE WHEN a.deposit_status IN ('awaiting', 'reported', 'paid') THEN s.pix_key END,
           CASE WHEN a.deposit_status IN ('awaiting', 'reported', 'paid') THEN s.pix_key_type END
    FROM public.appointments a
    JOIN public.stores s ON s.id = a.store_id
    WHERE a.id = p_appointment AND (a.customer_id = auth.uid() OR s.owner_id = auth.uid());
END; $$;

-- Entrada não paga no prazo: cancela e libera o horário
CREATE OR REPLACE FUNCTION public.expire_unpaid_appointment_deposits()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
    PERFORM set_config('app.deposit_rpc', '1', true);
    UPDATE public.appointments SET status = 'cancelled', deposit_status = 'expired', updated_at = now()
    WHERE deposit_status = 'awaiting' AND deposit_due_at < now() AND status::text = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM set_config('app.deposit_rpc', '0', true);
    RETURN n;
END; $$;

REVOKE ALL ON FUNCTION public.report_appointment_deposit(uuid), public.confirm_appointment_deposit(uuid), public.refund_appointment_deposit(uuid), public.get_appointment_deposit(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.report_appointment_deposit(uuid), public.confirm_appointment_deposit(uuid), public.refund_appointment_deposit(uuid), public.get_appointment_deposit(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.expire_unpaid_appointment_deposits() FROM public, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'appointment-deposit-expire';
SELECT cron.schedule('appointment-deposit-expire', '* * * * *', $job$SELECT public.expire_unpaid_appointment_deposits()$job$);
