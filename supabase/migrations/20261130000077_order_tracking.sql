-- 20261130000077_order_tracking.sql
--
-- O CLIENTE ACOMPANHA O ENTREGADOR (18/11/2026; estudo docs/estudos/2026-11-18-delivery-concorrencia-dinheiro.md): "onde está o meu pedido?" é a pergunta nº 1
-- de qualquer delivery, e até aqui só a LOJA via "Rafa chega em ~6 min". get_order_tracking(pedido) entrega ao COMPRADOR, enquanto a entrega está em andamento:
-- a etapa (indo à loja · na loja · a caminho de você · na sua porta), o primeiro nome e o veículo do entregador e a posição AO VIVO dele (driver_pricing.live_*,
-- só se tiver até 5 min); o tempo é calculado na tela (linha reta × 1,3 a ~30 km/h, a mesma conta da loja). Antes de o entregador sair da loja a posição é
-- ARREDONDADA (~330 m, a grade do Radar): o cliente vê que ele está a caminho, sem acompanhar cada rua; depois da retirada, a posição exata (como em todo app).
-- Ninguém mais recebe nada: só o comprador do pedido, só durante a entrega.
-- Rollback: supabase/rollbacks/order_tracking_rollback.sql.

CREATE OR REPLACE FUNCTION public.get_order_tracking(p_order uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o public.orders; r public.ride_requests; dp record; v record; s record; v_stage text; v_fresh boolean; v_exact boolean;
BEGIN
    IF uid IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO o FROM public.orders WHERE id = p_order AND buyer_id = uid;
    IF NOT FOUND OR o.status IN ('paid', 'rejected') THEN RETURN NULL; END IF;
    SELECT * INTO r FROM public.ride_requests WHERE order_id = p_order AND status = 'accepted' AND driver_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_stage := CASE WHEN r.arrived_destination_at IS NOT NULL THEN 'at_door'
                    WHEN r.ride_started_at IS NOT NULL THEN 'delivering'
                    WHEN r.driver_arrived_at IS NOT NULL THEN 'at_store'
                    ELSE 'to_store' END;
    SELECT live_lat, live_lng, live_updated_at INTO dp FROM public.driver_pricing WHERE driver_id = r.driver_id;
    v_fresh := dp.live_lat IS NOT NULL AND dp.live_lng IS NOT NULL AND dp.live_updated_at > now() - interval '5 minutes';
    v_exact := v_stage IN ('delivering', 'at_door');
    SELECT vehicle_kind, car_model, car_color INTO v FROM public.driver_vehicles WHERE driver_id = r.driver_id ORDER BY updated_at DESC LIMIT 1;
    SELECT name, store_lat, store_lng INTO s FROM public.stores WHERE id = o.store_id;
    RETURN jsonb_build_object(
        'stage', v_stage,
        'driver_name', (SELECT split_part(COALESCE(name, 'Entregador'), ' ', 1) FROM public.profiles WHERE id = r.driver_id),
        'vehicle_kind', v.vehicle_kind, 'vehicle_model', v.car_model, 'vehicle_color', v.car_color,
        'lat', CASE WHEN NOT v_fresh THEN NULL WHEN v_exact THEN dp.live_lat ELSE round((dp.live_lat / 0.003)::numeric) * 0.003 END,
        'lng', CASE WHEN NOT v_fresh THEN NULL WHEN v_exact THEN dp.live_lng ELSE round((dp.live_lng / 0.003)::numeric) * 0.003 END,
        'exact', v_exact AND v_fresh,
        'updated_at', CASE WHEN v_fresh THEN dp.live_updated_at END,
        'dest_lat', o.delivery_lat, 'dest_lng', o.delivery_lng,
        'store_name', s.name, 'store_lat', s.store_lat, 'store_lng', s.store_lng);
END; $$;
REVOKE ALL ON FUNCTION public.get_order_tracking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_tracking(uuid) TO authenticated;
