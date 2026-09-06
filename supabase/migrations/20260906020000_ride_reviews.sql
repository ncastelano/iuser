-- Avaliação mútua pós-corrida: motorista avalia o passageiro e vice-versa.
-- Mesmo formato do product_reviews (20260507000000_add_product_reviews.sql),
-- mas com reviewer/reviewee explícitos porque aqui os dois lados avaliam
-- (lá só o comprador avaliava a loja/produto).
CREATE TABLE IF NOT EXISTS public.ride_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_request_id UUID NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (ride_request_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS ride_reviews_reviewee_idx ON public.ride_reviews (reviewee_id);

ALTER TABLE public.ride_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Avaliações de corrida são públicas" ON public.ride_reviews FOR SELECT USING (true);

-- Mais rígido que o precedente de product_reviews: exige que a corrida
-- esteja completed e que reviewer/reviewee sejam de fato o passageiro e o
-- motorista daquele pedido (product_reviews confia só no app pra isso).
CREATE POLICY "Participante avalia a corrida finalizada" ON public.ride_reviews FOR INSERT
    WITH CHECK (
        auth.uid() = reviewer_id
        AND EXISTS (
            SELECT 1 FROM public.ride_requests rr
            WHERE rr.id = ride_request_id
              AND rr.status = 'completed'
              AND (
                  (rr.requester_id = auth.uid() AND rr.driver_id = reviewee_id)
                  OR (rr.driver_id = auth.uid() AND rr.requester_id = reviewee_id)
              )
        )
    );
