-- Motorista pode ativar em "Definir local" o compartilhamento da sua
-- localização em tempo real (watchPosition) pra usar em /aceitar-corridas,
-- em vez de uma única leitura de GPS feita ao abrir a página. Guardado em
-- driver_pricing porque só existe pra quem já aceitou um plano de tarifa.
ALTER TABLE public.driver_pricing
    ADD COLUMN live_location_sync BOOLEAN NOT NULL DEFAULT false;
