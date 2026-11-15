-- Desfaz 20261130000012_delivery_dues_disputes: tira o caixa do entregador e as contestações (as pendências e contestações já gravadas SÃO APAGADAS).
DROP TRIGGER IF EXISTS ride_requests_zz_dues_on_end ON public.ride_requests;
DROP TRIGGER IF EXISTS ride_requests_zz_dues_machine_out ON public.ride_requests;
DROP FUNCTION IF EXISTS public.trg_dues_on_ride_end();
DROP FUNCTION IF EXISTS public.trg_dues_machine_out();
CREATE OR REPLACE FUNCTION public.guard_ride_applications_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_offered numeric;
    v_order uuid;
    v_active integer;
    v_cap integer;
    v_units numeric;
    v_cap_units numeric;
    v_new_units numeric;
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF NEW.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Candidatura nova começa pendente' USING ERRCODE = '42501';
    END IF;
    IF NEW.proposed_price IS NOT NULL AND (NEW.proposed_price <= 0 OR NEW.proposed_price > 100000) THEN
        RAISE EXCEPTION 'Valor inválido' USING ERRCODE = '42501';
    END IF;
    -- Janela dos FAVORITOS: durante ela só os favoritos aceitos da loja podem aceitar (antes de qualquer leitura de ride_offers, que a política esconde dos demais)
    IF NOT public._offer_open_to(NEW.ride_request_id, NEW.applicant_id) THEN
        RAISE EXCEPTION 'Esta entrega está, por alguns minutos, só para os motoristas favoritos da loja' USING ERRCODE = '42501', HINT = 'exclusive_window';
    END IF;
    -- O frete de entrega de loja é fixo: quem aceita, aceita o valor oferecido (nada de preço próprio por aqui)
    SELECT order_id, offered_price INTO v_order, v_offered FROM public.ride_offers WHERE id = NEW.ride_request_id;
    IF v_order IS NOT NULL AND NEW.proposed_price IS DISTINCT FROM v_offered THEN
        RAISE EXCEPTION 'O frete desta entrega é fixo (R$ %): aceite o valor oferecido', v_offered USING ERRCODE = '42501';
    END IF;
    -- Capacidade: entrega de loja só cabe se o motorista ainda tem espaço na mochila (serializa as candidaturas do mesmo motorista)
    IF v_order IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('delivery_capacity:' || NEW.applicant_id::text));
        SELECT count(*) INTO v_active FROM public.ride_requests WHERE driver_id = NEW.applicant_id AND order_id IS NOT NULL AND status = 'accepted';
        SELECT COALESCE(max(delivery_capacity), 1) INTO v_cap FROM public.driver_vehicles WHERE driver_id = NEW.applicant_id;
        IF v_active >= v_cap THEN
            RAISE EXCEPTION 'Sua mochila está cheia: você já está com % entrega(s) e a sua capacidade é %', v_active, v_cap USING ERRCODE = '42501', HINT = 'delivery_capacity_full';
        END IF;
        -- ... e em VOLUME: soma das unidades das entregas que já leva + esta ≤ o que ele diz que cabe (se informou)
        SELECT max(delivery_capacity_units) INTO v_cap_units FROM public.driver_vehicles WHERE driver_id = NEW.applicant_id;
        IF v_cap_units IS NOT NULL THEN
            SELECT COALESCE(sum(delivery_units), 0) INTO v_units FROM public.ride_requests WHERE driver_id = NEW.applicant_id AND order_id IS NOT NULL AND status = 'accepted';
            SELECT COALESCE(delivery_units, 1) INTO v_new_units FROM public.ride_offers WHERE id = NEW.ride_request_id;
            IF v_units + v_new_units > v_cap_units THEN
                RAISE EXCEPTION 'Não cabe na sua mochila: você já leva % unidade(s), esta tem % e você informou caber %', v_units, v_new_units, v_cap_units USING ERRCODE = '42501', HINT = 'delivery_capacity_units_full';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;
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
CREATE OR REPLACE FUNCTION public.trg_ping_live_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.kind = ANY (ARRAY[
        'delivery_driver_assigned', 'delivery_picked_up', 'delivery_at_door', 'delivery_message', 'delivery_issue',
        'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_driver_cancelled', 'delivery_cancelled',
        'delivery_order_ready', 'delivery_completed',
        'favorite_invite', 'favorite_accepted', 'favorite_declined'
    ]) THEN
        PERFORM public._ping_delivery_events();
    END IF;
    RETURN NEW;
END; $$;
DELETE FROM public.profile_notifications WHERE kind IN ('dues_update', 'dispute_update');
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup', 'service_application',
    'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review',
    'customer_review', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered', 'delivery_driver_assigned',
    'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready', 'delivery_completed', 'delivery_done',
    'delivery_driver_cancelled', 'delivery_cancelled', 'delivery_at_door', 'delivery_message', 'delivery_issue',
    'favorite_invite', 'favorite_accepted', 'favorite_declined'
]));
DROP FUNCTION IF EXISTS public.admin_decide_dispute(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.admin_decide_due(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.confirm_dispute_refund(uuid, boolean);
DROP FUNCTION IF EXISTS public.declare_dispute_refund(uuid, text);
DROP FUNCTION IF EXISTS public.get_my_delivery_disputes(uuid);
DROP FUNCTION IF EXISTS public.get_delivery_dispute_view(uuid);
DROP FUNCTION IF EXISTS public.reply_delivery_dispute(uuid, text);
DROP FUNCTION IF EXISTS public.open_delivery_dispute(uuid, text, text);
DROP FUNCTION IF EXISTS public.confirm_due(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.get_store_dues(uuid);
DROP FUNCTION IF EXISTS public.declare_due(uuid, text);
DROP FUNCTION IF EXISTS public.get_due_remit_target(uuid);
DROP FUNCTION IF EXISTS public.get_my_dues();
DROP FUNCTION IF EXISTS public._machine_recompute(uuid, uuid);
DROP FUNCTION IF EXISTS public._store_slug_path(uuid);
DROP FUNCTION IF EXISTS public._dues_block_message(text);
DROP FUNCTION IF EXISTS public._dues_block_for_me(uuid);
DROP FUNCTION IF EXISTS public._driver_dues_block(uuid);
DROP FUNCTION IF EXISTS public._brl(numeric);
DROP TABLE IF EXISTS public.delivery_disputes;
DROP TABLE IF EXISTS public.store_dues;
DROP TABLE IF EXISTS public.delivery_dues_settings;
ALTER TABLE public.delivery_proofs DROP COLUMN IF EXISTS done_at, DROP COLUMN IF EXISTS done_dist_m;
