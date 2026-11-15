-- PROVA DE ENTREGA (V1): a entrega de pedido de loja só conclui com uma prova registrada.
--   CÓDIGO (padrão): cada entrega nasce com um código de 4 dígitos que SÓ o cliente vê (cartão do pedido + aviso quando o pedido sai da loja). Na porta o motorista
--     pede o código e digita; certo = prova registrada. 5 erros travam por 5 min.
--   FOTO (quando o cliente não responde): depois de 2 min da chegada ("Estou no local") o motorista pode registrar uma FOTO de onde deixou o pedido, com o motivo
--     (ninguém atendeu / cliente sem o código / deixado na porta). Cliente e loja são avisados e veem a foto.
--   complete_ride passa a exigir a prova (HINT proof_required). Tabela sem acesso do app: o código nunca sai por consulta direta (só get_delivery_proof_view, ao cliente).
-- Rollback: supabase/rollbacks/delivery_proof_rollback.sql

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('delivery-proofs', 'delivery-proofs', true, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "storage_insert_delivery_proofs" ON storage.objects;
CREATE POLICY "storage_insert_delivery_proofs" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'delivery-proofs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE TABLE IF NOT EXISTS public.delivery_proofs (
    ride_id      uuid PRIMARY KEY REFERENCES public.ride_requests(id) ON DELETE CASCADE,
    order_id     uuid NOT NULL,
    pin          text NOT NULL CHECK (pin ~ '^[0-9]{4}$'),
    attempts     integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    method       text CHECK (method IN ('pin', 'photo')),
    reason       text CHECK (reason IN ('no_answer', 'no_pin', 'left_at_door')),
    photo_path   text,
    proof_at     timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CHECK ((method = 'photo') = (photo_path IS NOT NULL AND reason IS NOT NULL))
);
ALTER TABLE public.delivery_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_proofs FROM anon, authenticated;
GRANT ALL ON public.delivery_proofs TO service_role;

-- cria o código da entrega (idempotente; entregas antigas ganham na primeira consulta)
CREATE OR REPLACE FUNCTION public._ensure_delivery_proof(p_ride uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pin text; v_order uuid;
BEGIN
    SELECT order_id INTO v_order FROM public.ride_requests WHERE id = p_ride;
    IF v_order IS NULL THEN RETURN NULL; END IF;
    INSERT INTO public.delivery_proofs (ride_id, order_id, pin) VALUES (p_ride, v_order, lpad(floor(random() * 10000)::int::text, 4, '0'))
    ON CONFLICT (ride_id) DO NOTHING;
    SELECT pin INTO v_pin FROM public.delivery_proofs WHERE ride_id = p_ride;
    RETURN v_pin;
END; $$;
REVOKE ALL ON FUNCTION public._ensure_delivery_proof(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_delivery_proof_create() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.order_id IS NOT NULL THEN PERFORM public._ensure_delivery_proof(NEW.id); END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_requests_delivery_proof ON public.ride_requests;
CREATE TRIGGER ride_requests_delivery_proof AFTER INSERT ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_proof_create();

-- o pedido saiu da loja: o cliente recebe o CÓDIGO (aviso na ilha + push)
CREATE OR REPLACE FUNCTION public.trg_delivery_proof_code_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pin text; v_buyer uuid;
BEGIN
    IF NEW.order_id IS NULL OR NOT (OLD.ride_started_at IS NULL AND NEW.ride_started_at IS NOT NULL) THEN RETURN NEW; END IF;
    v_pin := public._ensure_delivery_proof(NEW.id);
    SELECT buyer_id INTO v_buyer FROM public.orders WHERE id = NEW.order_id;
    PERFORM public._notify(v_buyer, 'delivery_message', NEW.driver_id, NEW.id,
        jsonb_build_object('title', 'Seu código de entrega: ' || v_pin, 'text', 'Diga o código ao entregador só quando ele chegar: ' || v_pin, 'path', '/carrinho?aba=pedidos'),
        'pin:' || NEW.id);
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_requests_zz_proof_code_notice ON public.ride_requests;
CREATE TRIGGER ride_requests_zz_proof_code_notice AFTER UPDATE OF ride_started_at ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_proof_code_notice();

-- o MOTORISTA registra a prova (código ou foto). Respostas sem exceção para o contador de erros valer: {ok:false,error:'wrong_pin'|'locked'|'wait'}
CREATE OR REPLACE FUNCTION public.submit_delivery_proof(p_ride uuid, p_method text, p_pin text DEFAULT NULL, p_photo text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r public.ride_requests; d public.delivery_proofs; v_wait numeric; v_buyer uuid; v_owner uuid; v_name text;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride FOR UPDATE;
    IF NOT FOUND OR r.driver_id IS DISTINCT FROM uid OR r.order_id IS NULL THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.status <> 'accepted' THEN RAISE EXCEPTION 'Essa entrega não está em andamento'; END IF;
    IF r.arrived_destination_at IS NULL THEN RAISE EXCEPTION 'Toque em "Estou no local" antes de confirmar a entrega.' USING HINT = 'arrival_required'; END IF;
    PERFORM public._ensure_delivery_proof(p_ride);
    SELECT * INTO d FROM public.delivery_proofs WHERE ride_id = p_ride FOR UPDATE;
    IF d.method IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'already', true, 'method', d.method); END IF;

    IF p_method = 'pin' THEN
        IF d.locked_until IS NOT NULL AND d.locked_until > now() THEN
            RETURN jsonb_build_object('ok', false, 'error', 'locked', 'seconds_left', ceil(extract(epoch FROM d.locked_until - now())));
        END IF;
        IF p_pin IS NOT NULL AND p_pin = d.pin THEN
            UPDATE public.delivery_proofs SET method = 'pin', proof_at = now(), attempts = 0, locked_until = NULL WHERE ride_id = p_ride;
            RETURN jsonb_build_object('ok', true, 'method', 'pin');
        END IF;
        IF d.attempts + 1 >= 5 THEN
            UPDATE public.delivery_proofs SET attempts = 0, locked_until = now() + interval '5 minutes' WHERE ride_id = p_ride;
            RETURN jsonb_build_object('ok', false, 'error', 'locked', 'seconds_left', 300);
        END IF;
        UPDATE public.delivery_proofs SET attempts = attempts + 1 WHERE ride_id = p_ride;
        RETURN jsonb_build_object('ok', false, 'error', 'wrong_pin', 'attempts_left', 5 - (d.attempts + 1));

    ELSIF p_method = 'photo' THEN
        IF p_reason NOT IN ('no_answer', 'no_pin', 'left_at_door') THEN RAISE EXCEPTION 'Diga por que está registrando a foto' USING ERRCODE = '22023'; END IF;
        IF p_photo IS NULL OR split_part(p_photo, '/', 1) <> uid::text OR p_photo ~ '\.\.' THEN RAISE EXCEPTION 'Foto inválida' USING ERRCODE = '22023'; END IF;
        v_wait := 120 - extract(epoch FROM now() - r.arrived_destination_at);
        IF v_wait > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'wait', 'seconds_left', ceil(v_wait)); END IF;
        UPDATE public.delivery_proofs SET method = 'photo', reason = p_reason, photo_path = p_photo, proof_at = now() WHERE ride_id = p_ride;
        SELECT buyer_id INTO v_buyer FROM public.orders WHERE id = r.order_id;
        SELECT s.owner_id INTO v_owner FROM public.orders o JOIN public.stores s ON s.id = o.store_id WHERE o.id = r.order_id;
        SELECT split_part(COALESCE(name, 'O entregador'), ' ', 1) INTO v_name FROM public.profiles WHERE id = uid;
        PERFORM public._notify(v_buyer, 'delivery_message', uid, p_ride, jsonb_build_object('title', 'Entrega registrada com foto', 'text', v_name || ' registrou uma foto da entrega do seu pedido', 'path', '/carrinho?aba=pedidos'), 'proof:' || p_ride);
        PERFORM public._notify(v_owner, 'delivery_message', uid, p_ride, jsonb_build_object('title', 'Entrega registrada com foto', 'text', v_name || ' entregou sem o código do cliente e registrou uma foto', 'path', '/painel-loja'), 'proofs:' || p_ride);
        RETURN jsonb_build_object('ok', true, 'method', 'photo');
    END IF;
    RAISE EXCEPTION 'Prova inválida' USING ERRCODE = '22023';
END; $$;

-- o motorista vê só o estado da prova das corridas DELE (sem o código)
CREATE OR REPLACE FUNCTION public.get_my_delivery_proofs(p_rides uuid[])
RETURNS TABLE (ride_id uuid, method text, locked_seconds integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT d.ride_id, d.method, CASE WHEN d.locked_until > now() THEN ceil(extract(epoch FROM d.locked_until - now()))::int ELSE 0 END
      FROM public.delivery_proofs d JOIN public.ride_requests r ON r.id = d.ride_id
     WHERE d.ride_id = ANY (p_rides) AND r.driver_id = auth.uid()
$$;

-- cliente (com o código) e dono da loja (sem o código) veem o andamento da prova do pedido
CREATE OR REPLACE FUNCTION public.get_delivery_proof_view(p_order uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o public.orders; r public.ride_requests; d public.delivery_proofs; v_is_buyer boolean; v_stage text;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_is_buyer := o.buyer_id = uid;
    IF NOT v_is_buyer AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = o.store_id AND owner_id = uid) THEN RETURN NULL; END IF;
    SELECT * INTO r FROM public.ride_requests WHERE order_id = p_order AND status IN ('accepted', 'completed') ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    PERFORM public._ensure_delivery_proof(r.id);
    SELECT * INTO d FROM public.delivery_proofs WHERE ride_id = r.id;
    v_stage := CASE WHEN r.status = 'completed' THEN 'delivered' WHEN r.ride_started_at IS NOT NULL THEN 'delivering' ELSE 'waiting' END;
    RETURN jsonb_build_object(
        'stage', v_stage, 'at_door', r.arrived_destination_at IS NOT NULL,
        'pin', CASE WHEN v_is_buyer AND v_stage = 'delivering' AND d.method IS NULL THEN d.pin END,
        'method', d.method, 'reason', d.reason, 'photo_path', d.photo_path, 'proof_at', d.proof_at);
END; $$;

-- concluir exige a prova
CREATE OR REPLACE FUNCTION public.complete_ride(p_ride uuid, p_lat double precision, p_lng double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r public.ride_requests;
    v_m numeric;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride FOR UPDATE;
    IF NOT FOUND OR r.driver_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.status <> 'accepted' THEN RAISE EXCEPTION 'Essa corrida não está em andamento'; END IF;
    IF r.ride_started_at IS NULL THEN RAISE EXCEPTION 'Inicie a corrida antes de concluir.'; END IF;
    IF r.order_id IS NOT NULL AND r.arrived_destination_at IS NULL THEN
        RAISE EXCEPTION 'Toque em "Estou no local" para avisar o cliente antes de concluir a entrega.' USING HINT = 'arrival_required';
    END IF;
    IF r.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.delivery_proofs WHERE ride_id = p_ride AND method IS NOT NULL) THEN
        RAISE EXCEPTION 'Confirme a entrega com o código do cliente (ou com a foto) antes de concluir.' USING HINT = 'proof_required';
    END IF;
    IF r.destination_lat IS NULL OR r.destination_lng IS NULL THEN
        RAISE EXCEPTION 'Não dá pra confirmar a chegada: esse pedido não tem coordenadas de destino.';
    END IF;
    IF p_lat IS NULL OR p_lng IS NULL THEN RAISE EXCEPTION 'Não conseguimos confirmar sua localização.'; END IF;
    v_m := public.haversine_km(r.destination_lat, r.destination_lng, p_lat, p_lng) * 1000;
    IF v_m > 100 THEN
        RAISE EXCEPTION 'Você está a % m do destino. Chegue a até 100 m pra concluir.', round(v_m);
    END IF;
    IF r.order_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.orders WHERE id = r.order_id AND status = 'rejected') THEN
        RAISE EXCEPTION 'O pedido desta entrega foi recusado';
    END IF;
    UPDATE public.ride_requests SET status = 'completed' WHERE id = p_ride AND status = 'accepted';
    RETURN jsonb_build_object('ok', true);
END;
$function$;

-- permissões das funções do app
DO $$ DECLARE f text; BEGIN
    FOREACH f IN ARRAY ARRAY['submit_delivery_proof(uuid,text,text,text,text)', 'get_my_delivery_proofs(uuid[])', 'get_delivery_proof_view(uuid)']
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
    END LOOP;
END $$;

-- as entregas abertas que já existem ganham o código
INSERT INTO public.delivery_proofs (ride_id, order_id, pin)
SELECT r.id, r.order_id, lpad(floor(random() * 10000)::int::text, 4, '0') FROM public.ride_requests r
 WHERE r.order_id IS NOT NULL AND r.status IN ('pending', 'accepted') ON CONFLICT (ride_id) DO NOTHING;
