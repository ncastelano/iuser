-- Desfaz 20261130000041_digital_order_notices.sql: volta o gatilho dos pedidos ao de 20261130000004 (sem o ramo digital) e a lista de tipos ao que era; apaga os avisos digitais.
DELETE FROM public.profile_notifications WHERE kind IN ('digital_order_new', 'digital_access_released');
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like', 'publication_comment', 'profile_comment', 'comment_reply', 'comment_like',
    'invite_signup', 'service_application', 'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review', 'customer_review',
    'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered',
    'delivery_driver_assigned', 'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready', 'delivery_completed', 'delivery_done',
    'delivery_driver_cancelled', 'delivery_cancelled', 'delivery_at_door', 'delivery_message', 'delivery_issue',
    'favorite_invite', 'favorite_accepted', 'favorite_declined', 'dues_update', 'dispute_update', 'moderation_update',
    'ride_offer_new', 'ride_offer_declined', 'ride_offer_agreed', 'ride_offer_expired'
]));
CREATE OR REPLACE FUNCTION public.trg_notify_order_events() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    s public.stores;
    v_buyer text;
    v_money text := 'R$ ' || replace(to_char(COALESCE(NEW.total_amount, 0), 'FM999G990D00'), '.', ',');
    v_driver uuid;
    v_path text;
BEGIN
    SELECT * INTO s FROM public.stores WHERE id = NEW.store_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    v_buyer := public._person_label(NEW.buyer_id);
    v_path := '/painel-loja/' || s."storeSlug";

    -- pedido novo: o total só fica certo depois que o banco calcula os itens (o pedido nasce com 0): avisa quando houver valor
    IF (TG_OP = 'INSERT' AND COALESCE(NEW.total_amount, 0) > 0) OR (TG_OP = 'UPDATE' AND COALESCE(OLD.total_amount, 0) <= 0 AND COALESCE(NEW.total_amount, 0) > 0 AND NEW.status = 'pending') THEN
        PERFORM public._notify(s.owner_id, 'order_new', NEW.buyer_id, NEW.id,
            jsonb_build_object('title', 'Pedido novo', 'text', v_buyer || ' pediu · ' || v_money || CASE WHEN NEW.delivery_option = 'entrega' THEN ' · entrega' ELSE ' · retirada' END, 'path', v_path, 'store_id', s.id, 'amount', NEW.total_amount),
            'o:' || NEW.id || ':new');
    END IF;
    IF TG_OP = 'INSERT' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

    IF NEW.status = 'preparing' THEN
        PERFORM public._notify(NEW.buyer_id, 'order_accepted', s.owner_id, NEW.id,
            jsonb_build_object('title', 'Pedido aceito', 'text', s.name || ' aceitou seu pedido e já está preparando', 'path', '/carrinho?aba=pedidos', 'store', s.name), 'o:' || NEW.id || ':preparing');
    ELSIF NEW.status = 'ready' THEN
        PERFORM public._notify(NEW.buyer_id, 'order_ready', s.owner_id, NEW.id,
            jsonb_build_object('title', 'Pedido pronto', 'text', CASE WHEN NEW.delivery_option = 'entrega' THEN s.name || ': seu pedido está pronto, o motorista vai buscar' ELSE s.name || ': seu pedido está pronto para retirar' END, 'path', '/carrinho?aba=pedidos', 'store', s.name), 'o:' || NEW.id || ':ready');
        -- o motorista que já aceitou a entrega fica sabendo que pode retirar
        SELECT r.driver_id INTO v_driver FROM public.ride_requests r WHERE r.order_id = NEW.id AND r.status = 'accepted' AND r.driver_id IS NOT NULL LIMIT 1;
        IF v_driver IS NOT NULL THEN
            PERFORM public._notify(v_driver, 'delivery_order_ready', s.owner_id, NEW.id,
                jsonb_build_object('title', 'Pedido pronto', 'text', 'O pedido de ' || v_buyer || ' na ' || s.name || ' está pronto para retirar', 'path', '/entregas', 'store', s.name), 'o:' || NEW.id || ':driver_ready');
        END IF;
    ELSIF NEW.status = 'rejected' THEN
        PERFORM public._notify(NEW.buyer_id, 'order_rejected', s.owner_id, NEW.id,
            jsonb_build_object('title', 'Pedido recusado', 'text', s.name || ' não pôde atender seu pedido', 'path', '/carrinho?aba=pedidos', 'store', s.name), 'o:' || NEW.id || ':rejected');
    ELSIF NEW.status = 'paid' THEN
        PERFORM public._notify(NEW.buyer_id, 'order_delivered', s.owner_id, NEW.id,
            jsonb_build_object('title', 'Pedido entregue', 'text', 'Seu pedido da ' || s.name || ' foi entregue. Conta como foi!', 'path', '/carrinho?aba=pedidos', 'store', s.name), 'o:' || NEW.id || ':delivered');
    END IF;
    RETURN NEW;
END $$;
