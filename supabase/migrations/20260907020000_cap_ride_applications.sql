-- Limita a no máximo 5 motoristas candidatos por pedido de corrida. Um
-- contador denormalizado em ride_requests é necessário porque a RLS de
-- ride_applications só deixa cada motorista enxergar a PRÓPRIA candidatura
-- (nunca as dos outros) — sem o contador não daria pra checar "já tem 5?"
-- nem pra mostrar quantas vagas restam no quadro de /aceitar-corridas.
ALTER TABLE public.ride_requests
    ADD COLUMN applicant_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.bump_ride_applicant_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.ride_requests SET applicant_count = applicant_count + 1 WHERE id = NEW.ride_request_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.ride_requests SET applicant_count = GREATEST(0, applicant_count - 1) WHERE id = OLD.ride_request_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER ride_applications_bump_count
    AFTER INSERT OR DELETE ON public.ride_applications
    FOR EACH ROW EXECUTE FUNCTION public.bump_ride_applicant_count();

-- Trava o limite também na própria RLS (defesa em profundidade — não dá pra
-- confiar só no client filtrar pedidos cheios da lista).
DROP POLICY "Candidato se candidata a pedido de motorista de outra pessoa" ON public.ride_applications;

CREATE POLICY "Candidato se candidata a pedido de motorista de outra pessoa" ON public.ride_applications FOR INSERT
    WITH CHECK (
        auth.uid() = applicant_id
        AND EXISTS (
            SELECT 1 FROM public.ride_requests rr
            WHERE rr.id = ride_request_id AND rr.requester_id <> auth.uid() AND rr.applicant_count < 5
        )
    );
