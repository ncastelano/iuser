-- Confirmação de chegada na parada (igual à de partida/chegada) — o
-- motorista toca um botão perto da parada antes de poder tocar em "Cheguei
-- ao destino". Fica registrado quando ele chegou lá, não só "perto".
ALTER TABLE public.ride_requests ADD COLUMN IF NOT EXISTS stop_reached_at TIMESTAMPTZ;

-- Trava também no banco (não só no botão da tela): não deixa concluir uma
-- corrida com parada sem ter confirmado a chegada nela primeiro.
CREATE OR REPLACE FUNCTION public.require_stop_reached_before_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
       AND NEW.stop_lat IS NOT NULL AND NEW.stop_lng IS NOT NULL AND NEW.stop_reached_at IS NULL THEN
        RAISE EXCEPTION 'Confirme a chegada na parada antes de concluir a corrida.';
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_requests_require_stop_reached ON public.ride_requests;
CREATE TRIGGER ride_requests_require_stop_reached BEFORE UPDATE OF status ON public.ride_requests
    FOR EACH ROW EXECUTE FUNCTION public.require_stop_reached_before_completion();
