-- Etapa 1.6 — item 3: link público de acompanhamento com TOKEN próprio.
--
-- Achado da auditoria: /api/ride-share/[id] usava o próprio UUID da corrida como "segredo". Esse UUID passou a circular
-- entre motoristas (ride_offers.id, URL de push, realtime), então qualquer motorista podia abrir o endpoint de uma corrida
-- ALHEIA, mesmo pendente, e ler endereços completos, complementos e o @ do solicitante, para sempre.
--
-- Correção: o link usa um token aleatório (160 bits) que só o solicitante e o motorista da corrida enxergam
-- (ride_requests é privada; o token NÃO está em ride_offers). O link expira: vale enquanto a corrida está pendente/aceita
-- e por mais 6 h depois de concluída/cancelada (e no máximo 30 dias). O token é do servidor (imutável para o cliente) e
-- pode ser trocado (revogado) por rotate_ride_share_token.

ALTER TABLE public.ride_requests
    ADD COLUMN IF NOT EXISTS share_token text,
    ADD COLUMN IF NOT EXISTS share_closed_at timestamptz;

UPDATE public.ride_requests
   SET share_token = substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 40)
 WHERE share_token IS NULL;
UPDATE public.ride_requests SET share_closed_at = now() WHERE share_closed_at IS NULL AND status IN ('completed', 'cancelled');

ALTER TABLE public.ride_requests
    ALTER COLUMN share_token SET DEFAULT substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 40),
    ALTER COLUMN share_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ride_requests_share_token_idx ON public.ride_requests (share_token);

-- Fecha o relógio de expiração quando a corrida termina
CREATE OR REPLACE FUNCTION public.set_ride_share_closed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status IN ('completed', 'cancelled') AND OLD.status IS DISTINCT FROM NEW.status AND NEW.share_closed_at IS NULL THEN
        NEW.share_closed_at := now();
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ride_requests_set_share_closed ON public.ride_requests;
CREATE TRIGGER ride_requests_set_share_closed
    BEFORE UPDATE OF status ON public.ride_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_ride_share_closed();

-- O cliente nunca escolhe o token (nem o relógio) ao criar a corrida: o servidor sorteia.
-- Recria a guarda de INSERT da 20261087 com essa linha a mais (a 20261087 fica intacta).
CREATE OR REPLACE FUNCTION public.guard_ride_requests_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF NEW.requester_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Corrida só pode ser criada em nome de quem está logado' USING ERRCODE = '42501';
    END IF;
    IF NEW.order_id IS NOT NULL OR NEW.store_id IS NOT NULL OR NEW.offered_price IS NOT NULL OR NEW.visible_radius_km IS NOT NULL THEN
        RAISE EXCEPTION 'Entrega de loja só é criada pelo servidor' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM 'pending'
       OR NEW.driver_id IS NOT NULL OR NEW.cancelled_by IS NOT NULL
       OR NEW.driver_en_route IS TRUE OR NEW.driver_departed_at IS NOT NULL OR NEW.driver_arrived_at IS NOT NULL
       OR NEW.ride_started_at IS NOT NULL OR NEW.stop1_reached_at IS NOT NULL OR NEW.stop2_reached_at IS NOT NULL
       OR COALESCE(NEW.applicant_count, 0) <> 0
       OR NEW.extra_task_minutes IS NOT NULL OR NEW.extra_task_fee IS NOT NULL OR NEW.extra_task_description IS NOT NULL THEN
        RAISE EXCEPTION 'Corrida nova começa pendente, sem motorista e sem etapas' USING ERRCODE = '42501';
    END IF;
    NEW.share_token := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 40);
    NEW.share_closed_at := NULL;
    RETURN NEW;
END;
$$;

-- Revogar/trocar o link (só quem participa da corrida). O link antigo para de funcionar na hora.
CREATE OR REPLACE FUNCTION public.rotate_ride_share_token(p_ride uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_new text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 40);
    v_updated integer;
BEGIN
    UPDATE public.ride_requests SET share_token = v_new
     WHERE id = p_ride AND (requester_id = auth.uid() OR driver_id = auth.uid());
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION public.rotate_ride_share_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_ride_share_token(uuid) TO authenticated;
