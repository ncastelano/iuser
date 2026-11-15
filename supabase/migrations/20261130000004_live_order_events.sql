-- Eventos ao vivo de PEDIDOS e ENTREGAS para a ilha (cliente, loja e motorista), pelo mesmo canal das notificações do perfil (profile_notifications).
-- Os gatilhos escrevem (SECURITY DEFINER); cada pessoa só lê as dela (RLS já existente) e o app escuta o Realtime e mostra na ilha.
--   Cliente: pedido aceito / pronto / recusado / entregue, motorista a caminho de levar, pedido saiu para entrega.
--   Loja:    pedido novo, motorista aceitou, motorista chegou (com o CÓDIGO DE RETIRADA), saiu com os pedidos, entregue, motorista cancelou.
--   Motorista: pedido pronto para retirar, entrega concluída (valor) e entrega cancelada.
-- Rollback: supabase/rollbacks/live_order_events_rollback.sql

ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like', 'publication_comment', 'profile_comment', 'comment_reply', 'comment_like',
    'invite_signup', 'service_application', 'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review', 'customer_review',
    'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered',
    'delivery_driver_assigned', 'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready', 'delivery_completed', 'delivery_done',
    'delivery_driver_cancelled', 'delivery_cancelled'
]));

CREATE OR REPLACE FUNCTION public._person_label(p_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(NULLIF(split_part(name, ' ', 1), ''), '@' || "profileSlug", 'Alguém') FROM public.profiles WHERE id = p_id
$$;
REVOKE ALL ON FUNCTION public._person_label(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- pedidos
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
DROP TRIGGER IF EXISTS orders_zz_notify_events ON public.orders;
CREATE TRIGGER orders_zz_notify_events AFTER INSERT OR UPDATE OF status, total_amount ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_notify_order_events();

-- ---------------------------------------------------------------- entregas (corrida de pedido de loja)
CREATE OR REPLACE FUNCTION public.trg_notify_delivery_events() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    o public.orders; s public.stores; v_driver text; v_buyer text; v_code text; v_n int; v_path text; v_money text;
BEGIN
    IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    SELECT * INTO s FROM public.stores WHERE id = o.store_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    v_path := '/painel-loja/' || s."storeSlug";
    v_buyer := public._person_label(o.buyer_id);
    v_driver := public._person_label(NEW.driver_id);

    -- um motorista aceitou levar o pedido
    IF OLD.driver_id IS NULL AND NEW.driver_id IS NOT NULL AND NEW.status = 'accepted' THEN
        PERFORM public._notify(o.buyer_id, 'delivery_driver_assigned', NEW.driver_id, NEW.id,
            jsonb_build_object('title', 'Motorista a caminho da loja', 'text', v_driver || ' vai levar seu pedido da ' || s.name, 'path', '/carrinho?aba=pedidos', 'store', s.name), 'r:' || NEW.id || ':assigned');
        PERFORM public._notify(s.owner_id, 'delivery_driver_accepted', NEW.driver_id, NEW.id,
            jsonb_build_object('title', 'Motorista aceitou', 'text', v_driver || ' vai levar o pedido de ' || v_buyer, 'path', v_path, 'store_id', s.id), 'r:' || NEW.id || ':accepted');
    END IF;

    -- chegou na loja: a loja recebe o CÓDIGO DE RETIRADA para informar depois de conferir os pedidos
    IF OLD.driver_arrived_at IS NULL AND NEW.driver_arrived_at IS NOT NULL AND NEW.ride_started_at IS NULL AND NEW.driver_id IS NOT NULL THEN
        SELECT code INTO v_code FROM public.delivery_pickup_codes WHERE store_id = o.store_id AND driver_id = NEW.driver_id AND used_at IS NULL ORDER BY created_at DESC LIMIT 1;
        SELECT count(*) INTO v_n FROM public.ride_requests r WHERE r.store_id = o.store_id AND r.driver_id = NEW.driver_id AND r.status = 'accepted' AND r.order_id IS NOT NULL AND r.ride_started_at IS NULL;
        PERFORM public._notify(s.owner_id, 'delivery_driver_arrived', NEW.driver_id, NEW.id,
            jsonb_build_object('title', v_driver || ' chegou para retirar', 'text', v_driver || ' chegou para retirar ' || GREATEST(v_n, 1) || CASE WHEN GREATEST(v_n, 1) = 1 THEN ' pedido' ELSE ' pedidos' END || COALESCE(' · código ' || v_code, ''), 'path', v_path, 'store_id', s.id, 'code', v_code),
            'arr:' || o.store_id || ':' || NEW.driver_id || ':' || floor(extract(epoch FROM now()) / 120)::text);   -- uma vez por chegada (várias corridas da mesma saída chegam juntas)
    END IF;

    -- saiu com os pedidos (retirada confirmada)
    IF OLD.ride_started_at IS NULL AND NEW.ride_started_at IS NOT NULL THEN
        PERFORM public._notify(o.buyer_id, 'delivery_picked_up', NEW.driver_id, NEW.id,
            jsonb_build_object('title', 'Seu pedido saiu para entrega', 'text', v_driver || ' saiu da ' || s.name || ' com seu pedido', 'path', '/carrinho?aba=pedidos', 'store', s.name), 'r:' || NEW.id || ':picked');
        SELECT count(*) INTO v_n FROM public.ride_requests r WHERE r.store_id = o.store_id AND r.driver_id = NEW.driver_id AND r.status = 'accepted' AND r.order_id IS NOT NULL AND r.ride_started_at > now() - interval '1 minute';
        PERFORM public._notify(s.owner_id, 'delivery_picked_up', NEW.driver_id, NEW.id,
            jsonb_build_object('title', 'Retirada confirmada', 'text', v_driver || ' saiu com ' || CASE WHEN GREATEST(v_n, 1) = 1 THEN 'o pedido de ' || v_buyer ELSE GREATEST(v_n, 1) || ' pedidos' END, 'path', v_path, 'store_id', s.id),
            'pick:' || o.store_id || ':' || NEW.driver_id || ':' || floor(extract(epoch FROM now()) / 120)::text);
    END IF;

    -- terminou / cancelou
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'completed' THEN
            v_money := 'R$ ' || replace(to_char(COALESCE(NEW.offered_price, 0), 'FM999G990D00'), '.', ',');
            PERFORM public._notify(NEW.driver_id, 'delivery_completed', s.owner_id, NEW.id,
                jsonb_build_object('title', 'Entrega concluída', 'text', 'Entrega para ' || v_buyer || ' concluída · ' || v_money, 'path', '/entregas', 'amount', NEW.offered_price), 'r:' || NEW.id || ':completed');
            PERFORM public._notify(s.owner_id, 'delivery_done', NEW.driver_id, NEW.id,
                jsonb_build_object('title', 'Pedido entregue', 'text', v_driver || ' entregou o pedido de ' || v_buyer, 'path', v_path, 'store_id', s.id), 'r:' || NEW.id || ':done');
        ELSIF NEW.status = 'cancelled' AND OLD.status = 'accepted' AND NEW.driver_id IS NOT NULL THEN
            IF NEW.cancelled_by = 'driver' THEN
                PERFORM public._notify(s.owner_id, 'delivery_driver_cancelled', NEW.driver_id, NEW.id,
                    jsonb_build_object('title', 'Motorista cancelou', 'text', v_driver || ' cancelou a entrega de ' || v_buyer || ': o pedido volta a procurar motorista', 'path', v_path, 'store_id', s.id), 'r:' || NEW.id || ':drv_cancel');
            ELSE
                PERFORM public._notify(NEW.driver_id, 'delivery_cancelled', s.owner_id, NEW.id,
                    jsonb_build_object('title', 'Entrega cancelada', 'text', 'A entrega para ' || v_buyer || ' foi cancelada', 'path', '/entregas'), 'r:' || NEW.id || ':cancelled');
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ride_requests_zz_notify_delivery ON public.ride_requests;
CREATE TRIGGER ride_requests_zz_notify_delivery AFTER UPDATE ON public.ride_requests FOR EACH ROW WHEN (NEW.order_id IS NOT NULL) EXECUTE FUNCTION public.trg_notify_delivery_events();
