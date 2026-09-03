-- Turbina o pedido de motorista: nº de passageiros (define o veículo sugerido),
-- destinatário de entregas (quando é diferente de quem pediu), e instruções de
-- acesso ao local (portaria de condomínio, retirar pedido dentro de um
-- estabelecimento, etc.) tanto na origem quanto no destino.
ALTER TABLE public.ride_requests
    ADD COLUMN passenger_count INT NOT NULL DEFAULT 1 CHECK (passenger_count BETWEEN 1 AND 30),
    ADD COLUMN vehicle_type TEXT NOT NULL DEFAULT 'carro' CHECK (vehicle_type IN ('carro', 'van', 'van-grande')),
    ADD COLUMN origin_needs_access BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN origin_access_notes TEXT,
    ADD COLUMN destination_needs_access BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN destination_access_notes TEXT,
    ADD COLUMN recipient_name TEXT,
    ADD COLUMN recipient_phone TEXT;
