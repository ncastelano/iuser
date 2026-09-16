-- Achado pelo usuário: dava pra se candidatar a uma corrida (POST direto em
-- ride_applications) sem nenhum plano Motorista/Combo ativo — a RLS só
-- checava dono da corrida + limite de 5 candidatos, nunca o plano. A
-- página /aceitar-corridas ganhou um gate visual (useActivePlans), mas
-- isso é só UX — quem chama a API direto ainda passava. Trava aqui de
-- verdade, mesmo padrão de get_active_plan_grants já usado em
-- create_store_with_access/Store.tsx.
DROP POLICY "Candidato se candidata a pedido de motorista de outra pessoa" ON public.ride_applications;

CREATE POLICY "Candidato se candidata a pedido de motorista de outra pessoa" ON public.ride_applications FOR INSERT
    WITH CHECK (
        auth.uid() = applicant_id
        AND EXISTS (
            SELECT 1 FROM public.ride_requests rr
            WHERE rr.id = ride_request_id AND rr.requester_id <> auth.uid() AND rr.applicant_count < 5
        )
        AND (SELECT has_driver FROM public.get_active_plan_grants(auth.uid()))
    );
