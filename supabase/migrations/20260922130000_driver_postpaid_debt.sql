-- Pós-pago do motorista: cada corrida finalizada cobra R$0,50 extra,
-- acumulando numa dívida; ao atingir R$50 o motorista não consegue mais
-- se candidatar a novas corridas até quitar. Ledger somado (mesmo idioma
-- de wallet_transactions) — linhas positivas são taxa por corrida, linhas
-- negativas são pagamento recebido via Pix avulso.
CREATE TABLE IF NOT EXISTS public.driver_postpaid_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    ride_request_id UUID REFERENCES public.ride_requests(id),
    type TEXT NOT NULL CHECK (type IN ('ride_fee', 'payment')),
    amount NUMERIC(10,2) NOT NULL,
    asaas_payment_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
-- Dedupe: o trigger nunca cobra a mesma corrida duas vezes; o webhook
-- nunca credita o mesmo pagamento Pix duas vezes (reentrega de evento).
CREATE UNIQUE INDEX IF NOT EXISTS driver_postpaid_ride_fee_dedupe_idx
    ON public.driver_postpaid_charges (ride_request_id) WHERE type = 'ride_fee';
CREATE UNIQUE INDEX IF NOT EXISTS driver_postpaid_payment_dedupe_idx
    ON public.driver_postpaid_charges (asaas_payment_id) WHERE type = 'payment';
CREATE INDEX IF NOT EXISTS driver_postpaid_driver_idx ON public.driver_postpaid_charges (driver_id);

ALTER TABLE public.driver_postpaid_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Motorista vê seu próprio extrato de pós-pago" ON public.driver_postpaid_charges
    FOR SELECT USING (auth.uid() = driver_id);
-- Sem policy de INSERT/UPDATE pro client: só o trigger abaixo (dono da
-- função) e o webhook de pagamento (service role) escrevem aqui.

-- Cobra sozinho, sem depender do cliente: dispara na mesma transição de
-- status que aceitar-corridas/minhas-corridas já fazem hoje via update
-- direto (.update({status:'completed'})), então nenhuma mudança de
-- frontend é necessária pra cobrança em si funcionar.
CREATE OR REPLACE FUNCTION public.accrue_driver_postpaid_ride_fee()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.driver_id IS NOT NULL THEN
        INSERT INTO public.driver_postpaid_charges (driver_id, ride_request_id, type, amount)
        VALUES (NEW.driver_id, NEW.id, 'ride_fee', 0.50)
        ON CONFLICT (ride_request_id) WHERE type = 'ride_fee' DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ride_requests_accrue_postpaid_fee ON public.ride_requests;
CREATE TRIGGER ride_requests_accrue_postpaid_fee
    AFTER UPDATE OF status ON public.ride_requests
    FOR EACH ROW EXECUTE FUNCTION public.accrue_driver_postpaid_ride_fee();

-- Gate de dívida, mesmo formato de get_active_plan_grants — usado dentro
-- da policy de INSERT em ride_applications pra travar no banco, não só na UI.
CREATE OR REPLACE FUNCTION public.get_driver_postpaid_debt(p_driver_id uuid)
RETURNS numeric
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT COALESCE(sum(amount), 0) FROM public.driver_postpaid_charges WHERE driver_id = p_driver_id;
$$;
REVOKE ALL ON FUNCTION public.get_driver_postpaid_debt(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_driver_postpaid_debt(uuid) TO authenticated;

-- Estende a policy existente (20260921200000) com o gate de dívida — só
-- bloqueia se CANDIDATAR a corridas NOVAS, não afeta corrida já aceita em
-- andamento (sem passageiro largado no meio do caminho).
DROP POLICY "Candidato se candidata a pedido de motorista de outra pessoa" ON public.ride_applications;
CREATE POLICY "Candidato se candidata a pedido de motorista de outra pessoa" ON public.ride_applications FOR INSERT
    WITH CHECK (
        auth.uid() = applicant_id
        AND EXISTS (
            SELECT 1 FROM public.ride_requests rr
            WHERE rr.id = ride_request_id AND rr.requester_id <> auth.uid() AND rr.applicant_count < 5
        )
        AND (SELECT has_driver FROM public.get_active_plan_grants(auth.uid()))
        AND public.get_driver_postpaid_debt(auth.uid()) < 50
    );
