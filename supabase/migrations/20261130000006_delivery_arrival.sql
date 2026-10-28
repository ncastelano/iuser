-- "Estou no local": ao chegar no endereço do cliente, o motorista AVISA que está na porta (o cliente recebe o aviso na hora) e só depois conclui a entrega.
--   - ride_requests.arrived_destination_at: gravada SÓ pela função arrive_at_destination (o motorista da entrega, com o pedido já retirado e a até 150 m do endereço)
--   - complete_ride passa a exigir o aviso nas entregas de pedido de loja (HINT arrival_required)
--   - o gatilho avisa o CLIENTE (tipo delivery_at_door) pela mesma fila das notificações do perfil (a ilha mostra)
-- Rollback: supabase/rollbacks/delivery_arrival_rollback.sql

ALTER TABLE public.ride_requests ADD COLUMN IF NOT EXISTS arrived_destination_at timestamptz;

ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup', 'service_application',
    'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review',
    'customer_review', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered', 'delivery_driver_assigned',
    'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready', 'delivery_completed', 'delivery_done',
    'delivery_driver_cancelled', 'delivery_cancelled', 'delivery_at_door'
]));

-- A coluna só muda pela função (o app logado não grava direto)
CREATE OR REPLACE FUNCTION public.guard_arrival_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF TG_OP = 'INSERT' AND NEW.arrived_destination_at IS NOT NULL THEN
            RAISE EXCEPTION 'Use "Estou no local" para avisar o cliente' USING ERRCODE = '42501', HINT = 'arrival_rpc_only';
        ELSIF TG_OP = 'UPDATE' AND NEW.arrived_destination_at IS DISTINCT FROM OLD.arrived_destination_at THEN
            RAISE EXCEPTION 'Use "Estou no local" para avisar o cliente' USING ERRCODE = '42501', HINT = 'arrival_rpc_only';
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ride_requests_guard_arrival ON public.ride_requests;
CREATE TRIGGER ride_requests_guard_arrival BEFORE INSERT OR UPDATE ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION public.guard_arrival_column();

-- O motorista avisa que chegou no endereço do cliente
CREATE OR REPLACE FUNCTION public.arrive_at_destination(p_ride uuid, p_lat double precision, p_lng double precision) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    r public.ride_requests;
    v_m numeric;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride FOR UPDATE;
    IF NOT FOUND OR r.driver_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.order_id IS NULL THEN RAISE EXCEPTION 'Este aviso é só das entregas de pedido de loja'; END IF;
    IF r.status <> 'accepted' THEN RAISE EXCEPTION 'Essa entrega não está em andamento'; END IF;
    IF r.ride_started_at IS NULL THEN RAISE EXCEPTION 'Retire o pedido na loja (código de retirada) antes de avisar o cliente.'; END IF;
    IF r.arrived_destination_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
    IF r.destination_lat IS NULL OR r.destination_lng IS NULL THEN RAISE EXCEPTION 'Esse pedido não tem coordenadas de destino.'; END IF;
    IF p_lat IS NULL OR p_lng IS NULL THEN RAISE EXCEPTION 'Não conseguimos confirmar sua localização.'; END IF;
    v_m := public.haversine_km(r.destination_lat, r.destination_lng, p_lat, p_lng) * 1000;
    IF v_m > 150 THEN RAISE EXCEPTION 'Você está a % m do endereço. Chegue a até 150 m para avisar o cliente.', round(v_m); END IF;
    UPDATE public.ride_requests SET arrived_destination_at = now() WHERE id = p_ride;
    RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.arrive_at_destination(uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arrive_at_destination(uuid, double precision, double precision) TO authenticated;

-- Concluir a entrega de pedido exige o aviso "Estou no local" antes (o resto da regra é a de sempre)
CREATE OR REPLACE FUNCTION public.complete_ride(p_ride uuid, p_lat double precision, p_lng double precision)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
$$;
REVOKE ALL ON FUNCTION public.complete_ride(uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_ride(uuid, double precision, double precision) TO authenticated;

-- Aviso ao CLIENTE: o entregador está na porta
CREATE OR REPLACE FUNCTION public.trg_notify_delivery_arrival() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    o public.orders;
    s public.stores;
    v_driver text;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    SELECT * INTO s FROM public.stores WHERE id = o.store_id;
    v_driver := public._person_label(NEW.driver_id);
    PERFORM public._notify(o.buyer_id, 'delivery_at_door', NEW.driver_id, NEW.id,
        jsonb_build_object('title', v_driver || ' chegou', 'text', v_driver || ' está no seu endereço com o pedido da ' || COALESCE(s.name, 'loja') || ' — vá receber', 'path', '/carrinho?aba=pedidos', 'store', s.name),
        'r:' || NEW.id || ':door');
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ride_requests_zz_notify_arrival ON public.ride_requests;
CREATE TRIGGER ride_requests_zz_notify_arrival AFTER UPDATE OF arrived_destination_at ON public.ride_requests
    FOR EACH ROW WHEN (OLD.arrived_destination_at IS NULL AND NEW.arrived_destination_at IS NOT NULL AND NEW.order_id IS NOT NULL)
    EXECUTE FUNCTION public.trg_notify_delivery_arrival();
