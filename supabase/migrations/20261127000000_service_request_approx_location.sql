-- Pedidos de serviço passam a guardar uma posição APROXIMADA (arredondada para ~1 km), para o "Ver ao redor" mostrar os pedidos mais perto de
-- quem olha. A posição exata nunca é guardada aqui: o gatilho arredonda sempre, mesmo que o app mande coordenada precisa. Pedidos antigos
-- ficam sem posição (aparecem pelos mais novos, sem distância). Rollback: supabase/rollbacks/service_request_approx_location_rollback.sql.
ALTER TABLE public.service_requests
    ADD COLUMN IF NOT EXISTS approx_lat double precision,
    ADD COLUMN IF NOT EXISTS approx_lng double precision;

CREATE OR REPLACE FUNCTION public.service_requests_round_coords()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.approx_lat IS NULL OR NEW.approx_lng IS NULL OR NEW.approx_lat NOT BETWEEN -90 AND 90 OR NEW.approx_lng NOT BETWEEN -180 AND 180 THEN
        NEW.approx_lat := NULL; NEW.approx_lng := NULL;
    ELSE
        NEW.approx_lat := round(NEW.approx_lat::numeric, 2)::double precision;
        NEW.approx_lng := round(NEW.approx_lng::numeric, 2)::double precision;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS service_requests_round_coords ON public.service_requests;
CREATE TRIGGER service_requests_round_coords BEFORE INSERT OR UPDATE OF approx_lat, approx_lng ON public.service_requests
    FOR EACH ROW EXECUTE FUNCTION public.service_requests_round_coords();
