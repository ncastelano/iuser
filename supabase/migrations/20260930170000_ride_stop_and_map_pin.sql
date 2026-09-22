-- Parada opcional entre a partida e a chegada — a pessoa pode adicionar um
-- ponto no meio do caminho (ex: passar em algum lugar antes de seguir pro
-- destino). Mostrada pro motorista igual à partida/chegada.
ALTER TABLE public.ride_requests
    ADD COLUMN IF NOT EXISTS stop_address TEXT,
    ADD COLUMN IF NOT EXISTS stop_complement TEXT,
    ADD COLUMN IF NOT EXISTS stop_lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS stop_lng DOUBLE PRECISION;
