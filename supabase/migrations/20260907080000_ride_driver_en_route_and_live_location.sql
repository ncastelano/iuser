-- Depois que o passageiro aceita um motorista, ele fica esperando sem saber
-- se o motorista já saiu. driver_en_route marca que o motorista confirmou
-- que está indo até o ponto de partida (botão "Ir para o ponto de partida"
-- no dialog global de corrida aceita); driver_departed_at registra quando.
ALTER TABLE public.ride_requests
    ADD COLUMN driver_en_route BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN driver_departed_at TIMESTAMPTZ;

-- Localização ao vivo do motorista (preenchida a partir do watchPosition de
-- /aceitar-corridas quando "Sincronização para motorista" está ativada em
-- Definir local). Fica em driver_pricing porque só existe pra quem já tem
-- tarifa configurada — mesmo motivo de live_location_sync já estar aqui.
ALTER TABLE public.driver_pricing
    ADD COLUMN live_lat DOUBLE PRECISION,
    ADD COLUMN live_lng DOUBLE PRECISION,
    ADD COLUMN live_updated_at TIMESTAMPTZ;

-- driver_pricing hoje só é legível pelo próprio motorista. O passageiro de
-- uma corrida aceita por esse motorista também precisa ler a localização ao
-- vivo (e só ela importa pra ele — expor o resto da tarifa junto não é um
-- problema de privacidade real).
CREATE POLICY "Passageiro vê localização do motorista da corrida aceita" ON public.driver_pricing FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.ride_requests rr
            WHERE rr.driver_id = driver_pricing.driver_id
              AND rr.requester_id = auth.uid()
              AND rr.status = 'accepted'
        )
    );

-- Publica driver_pricing no realtime pra o passageiro poder assinar a
-- localização ao vivo do motorista (filtro simples por driver_id=eq., sem
-- o problema de filtros in.() em postgres_changes).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'driver_pricing'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_pricing;
    END IF;
END $$;
