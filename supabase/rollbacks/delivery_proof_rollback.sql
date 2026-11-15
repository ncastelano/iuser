-- Desfaz 20261130000011_delivery_proof (volta complete_ride a não exigir a prova).
DROP TRIGGER IF EXISTS ride_requests_zz_proof_code_notice ON public.ride_requests;
DROP TRIGGER IF EXISTS ride_requests_delivery_proof ON public.ride_requests;
DROP FUNCTION IF EXISTS public.trg_delivery_proof_code_notice();
DROP FUNCTION IF EXISTS public.trg_delivery_proof_create();
CREATE OR REPLACE FUNCTION public.complete_ride(p_ride uuid, p_lat double precision, p_lng double precision)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
DROP FUNCTION IF EXISTS public.get_delivery_proof_view(uuid);
DROP FUNCTION IF EXISTS public.get_my_delivery_proofs(uuid[]);
DROP FUNCTION IF EXISTS public.submit_delivery_proof(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public._ensure_delivery_proof(uuid);
DROP TABLE IF EXISTS public.delivery_proofs;
DROP POLICY IF EXISTS "storage_insert_delivery_proofs" ON storage.objects;
-- o bucket delivery-proofs e as fotos já enviadas ficam (apague pelo painel do Storage se quiser)
