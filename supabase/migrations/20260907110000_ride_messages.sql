-- Chat momentâneo entre passageiro e motorista de uma corrida aceita — some
-- de contexto junto com o pedido (nunca é uma conversa persistente/geral,
-- só existe enquanto a corrida existe, via ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS public.ride_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_request_id UUID NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ride_messages_ride_idx ON public.ride_messages (ride_request_id, created_at);

ALTER TABLE public.ride_messages ENABLE ROW LEVEL SECURITY;

-- Só o passageiro e o motorista daquela corrida enxergam/enviam mensagens.
CREATE POLICY "Participantes da corrida veem as mensagens" ON public.ride_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.ride_requests rr
            WHERE rr.id = ride_request_id
              AND (rr.requester_id = auth.uid() OR rr.driver_id = auth.uid())
        )
    );

-- Só dá pra mandar mensagem com a corrida já aceita (é quando os dois lados
-- têm o que conversar: motorista definido, indo buscar).
CREATE POLICY "Participantes da corrida enviam mensagens" ON public.ride_messages FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (
            SELECT 1 FROM public.ride_requests rr
            WHERE rr.id = ride_request_id
              AND rr.status = 'accepted'
              AND (rr.requester_id = auth.uid() OR rr.driver_id = auth.uid())
        )
    );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ride_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_messages;
    END IF;
END $$;
