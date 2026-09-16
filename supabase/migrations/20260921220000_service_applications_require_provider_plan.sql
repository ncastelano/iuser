-- Mesmo achado do usuário aplicado à candidatura de motorista
-- (20260921200000): dava pra se candidatar a um pedido de serviço em
-- /procurar-servico sem nenhum plano Prestador/Combo ativo — a RLS só
-- checava "não é seu próprio pedido". Trava com o mesmo padrão de
-- get_active_plan_grants já usado em ride_applications/create_store_with_access.
DROP POLICY "Candidato se candidata a pedido de outra pessoa" ON public.service_applications;

CREATE POLICY "Candidato se candidata a pedido de outra pessoa" ON public.service_applications FOR INSERT
    WITH CHECK (
        auth.uid() = applicant_id
        AND EXISTS (SELECT 1 FROM public.service_requests sr WHERE sr.id = service_request_id AND sr.requester_id <> auth.uid())
        AND (SELECT has_provider FROM public.get_active_plan_grants(auth.uid()))
    );
