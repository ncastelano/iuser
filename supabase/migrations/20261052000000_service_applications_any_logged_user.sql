-- Não existe mais o plano Prestador: qualquer pessoa logada pode se inscrever num pedido de serviço (menos no próprio).
-- Continua valendo o limite de dívida do Pós-pago (R$ 50). Quem é Pós-pago paga a taxa por serviço aceito, como antes.
DROP POLICY IF EXISTS "Candidato se candidata a pedido de outra pessoa" ON public.service_applications;
CREATE POLICY "Candidato se candidata a pedido de outra pessoa" ON public.service_applications FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = applicant_id
        AND EXISTS (SELECT 1 FROM public.service_requests sr WHERE sr.id = service_applications.service_request_id AND sr.requester_id <> auth.uid())
        AND public.get_driver_postpaid_debt(auth.uid()) < 50::numeric
    );
