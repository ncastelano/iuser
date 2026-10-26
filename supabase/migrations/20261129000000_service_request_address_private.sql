-- O endereço COMPLETO do pedido de serviço (com número) deixa de ficar na coluna pública. Antes, qualquer pessoa que consultasse
-- service_requests direto lia "Rua X, 120, Bairro..." (a tela só mostrava a rua, mas o dado estava lá). Agora:
--   * service_requests.location_address guarda só "Rua, Bairro" (public place, sem número nem complemento);
--   * o endereço completo vai para service_request_private.address (quem pediu lê; o profissional ESCOLHIDO recebe por get_service_request_location).
-- O app não muda de jeito: continua mandando o endereço completo em location_address e um gatilho faz a separação (também quando alguém EDITA o
-- endereço). Pedidos que já existiam são migrados. Rollback: supabase/rollbacks/service_request_address_private_rollback.sql.
ALTER TABLE public.service_request_private ALTER COLUMN lat DROP NOT NULL;
ALTER TABLE public.service_request_private ALTER COLUMN lng DROP NOT NULL;
ALTER TABLE public.service_request_private ADD COLUMN IF NOT EXISTS address text;

-- "Rua, Bairro" a partir de um endereço escrito (sem número, sem cidade/CEP); sem rua reconhecível, o próprio texto sem dígitos
CREATE OR REPLACE FUNCTION public._service_request_public_place(p_address text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT COALESCE(NULLIF(public._offer_place(p_address), ''), NULLIF(btrim(regexp_replace(COALESCE(p_address, ''), '[0-9]+', '', 'g')), ''), 'Local informado');
$$;

-- Pedido novo: guarda o endereço completo no privado e deixa só o público na linha
CREATE OR REPLACE FUNCTION public.service_requests_hide_address_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_public text := public._service_request_public_place(NEW.location_address);
BEGIN
    INSERT INTO public.service_request_private (request_id, address) VALUES (NEW.id, NEW.location_address)
    ON CONFLICT (request_id) DO UPDATE SET address = EXCLUDED.address;
    IF NEW.location_address IS DISTINCT FROM v_public THEN
        UPDATE public.service_requests SET location_address = v_public WHERE id = NEW.id;
    END IF;
    RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS service_requests_hide_address_ins ON public.service_requests;
CREATE TRIGGER service_requests_hide_address_ins AFTER INSERT ON public.service_requests
    FOR EACH ROW EXECUTE FUNCTION public.service_requests_hide_address_ins();

-- Endereço editado: o novo completo vai para o privado, a linha continua só com o público (pg_trigger_depth: não reage ao UPDATE do gatilho acima)
CREATE OR REPLACE FUNCTION public.service_requests_hide_address_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF pg_trigger_depth() > 1 OR NEW.location_address IS NOT DISTINCT FROM OLD.location_address THEN RETURN NEW; END IF;
    INSERT INTO public.service_request_private (request_id, address) VALUES (NEW.id, NEW.location_address)
    ON CONFLICT (request_id) DO UPDATE SET address = EXCLUDED.address;
    NEW.location_address := public._service_request_public_place(NEW.location_address);
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS service_requests_hide_address_upd ON public.service_requests;
CREATE TRIGGER service_requests_hide_address_upd BEFORE UPDATE OF location_address ON public.service_requests
    FOR EACH ROW EXECUTE FUNCTION public.service_requests_hide_address_upd();

-- Quem pediu ou foi escolhido recebe o endereço completo do privado
CREATE OR REPLACE FUNCTION public.get_service_request_location(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); r public.service_requests; p public.service_request_private;
BEGIN
    IF v_user IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO r FROM public.service_requests WHERE id = p_request;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF r.requester_id <> v_user AND NOT EXISTS (
        SELECT 1 FROM public.service_applications a WHERE a.service_request_id = p_request AND a.applicant_id = v_user AND a.status = 'accepted'
    ) THEN RETURN NULL; END IF;
    SELECT * INTO p FROM public.service_request_private WHERE request_id = p_request;
    RETURN jsonb_build_object('address', COALESCE(p.address, r.location_address), 'lat', p.lat, 'lng', p.lng,
                              'needs_access', r.location_needs_access, 'access_notes', r.location_access_notes);
END; $$;

-- Pedidos que já existiam: o completo vai para o privado e a linha fica só com o público (gatilhos desligados para não reprocessar)
ALTER TABLE public.service_requests DISABLE TRIGGER service_requests_hide_address_upd;
INSERT INTO public.service_request_private (request_id, address)
SELECT id, location_address FROM public.service_requests
ON CONFLICT (request_id) DO UPDATE SET address = COALESCE(public.service_request_private.address, EXCLUDED.address);
UPDATE public.service_requests SET location_address = public._service_request_public_place(location_address)
WHERE location_address IS DISTINCT FROM public._service_request_public_place(location_address);
ALTER TABLE public.service_requests ENABLE TRIGGER service_requests_hide_address_upd;
