-- Até 2 paradas entre a partida e a chegada (antes só 1). Renomeia as
-- colunas existentes pra "1ª parada" e adiciona a 2ª.
ALTER TABLE public.ride_requests RENAME COLUMN stop_address TO stop1_address;
ALTER TABLE public.ride_requests RENAME COLUMN stop_complement TO stop1_complement;
ALTER TABLE public.ride_requests RENAME COLUMN stop_lat TO stop1_lat;
ALTER TABLE public.ride_requests RENAME COLUMN stop_lng TO stop1_lng;
ALTER TABLE public.ride_requests RENAME COLUMN stop_reached_at TO stop1_reached_at;

ALTER TABLE public.ride_requests
    ADD COLUMN IF NOT EXISTS stop2_address TEXT,
    ADD COLUMN IF NOT EXISTS stop2_complement TEXT,
    ADD COLUMN IF NOT EXISTS stop2_lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS stop2_lng DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS stop2_reached_at TIMESTAMPTZ;

-- Não dá pra ter a 2ª parada preenchida sem a 1ª (a ordem importa: a rota é
-- partida → parada 1 → parada 2 → chegada).
ALTER TABLE public.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_stop_order_check;
ALTER TABLE public.ride_requests ADD CONSTRAINT ride_requests_stop_order_check
    CHECK (stop2_lat IS NULL OR stop1_lat IS NOT NULL);

CREATE OR REPLACE FUNCTION public.require_stop_reached_before_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
        IF NEW.stop1_lat IS NOT NULL AND NEW.stop1_lng IS NOT NULL AND NEW.stop1_reached_at IS NULL THEN
            RAISE EXCEPTION 'Confirme a chegada na 1ª parada antes de concluir a corrida.';
        END IF;
        IF NEW.stop2_lat IS NOT NULL AND NEW.stop2_lng IS NOT NULL AND NEW.stop2_reached_at IS NULL THEN
            RAISE EXCEPTION 'Confirme a chegada na 2ª parada antes de concluir a corrida.';
        END IF;
    END IF;
    RETURN NEW;
END; $$;
