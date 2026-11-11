-- CONVERSA RÁPIDA da entrega: motorista e cliente trocam FRASES PRONTAS (sem texto livre: nada para moderar) durante a entrega, e "Não encontro o endereço"/"Ninguém atende" avisam também a LOJA.
--   delivery_messages: o que foi dito (só código; o texto sai de _delivery_msg_text). Leitura: motorista, cliente e dono da loja da entrega. Escrita: só pela função send_delivery_message.
--   O destinatário recebe pela ilha (profile_notifications): o cliente já com a resposta de um toque ("Já estou descendo"); a loja como "Entrega com problema".
-- Rollback: supabase/rollbacks/delivery_messages_rollback.sql

ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup', 'service_application',
    'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review',
    'customer_review', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered', 'delivery_driver_assigned',
    'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready', 'delivery_completed', 'delivery_done',
    'delivery_driver_cancelled', 'delivery_cancelled', 'delivery_at_door', 'delivery_message', 'delivery_issue'
]));

CREATE TABLE IF NOT EXISTS public.delivery_messages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id     uuid NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
    sender_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_role text NOT NULL CHECK (sender_role IN ('driver', 'customer')),
    code        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_messages_ride_idx ON public.delivery_messages (ride_id, created_at);
ALTER TABLE public.delivery_messages ENABLE ROW LEVEL SECURITY;

-- as frases (a única fonte: o app só mostra rótulos curtos)
CREATE OR REPLACE FUNCTION public._delivery_msg_text(p_code text, p_role text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_role
        WHEN 'driver' THEN CASE p_code
            WHEN 'at_gate'   THEN 'Estou em frente ao endereço'
            WHEN 'cant_find' THEN 'Não estou encontrando o endereço. Pode me ajudar?'
            WHEN 'no_answer' THEN 'Estou aqui e ninguém atende. Pode vir até a porta?'
            WHEN 'late'      THEN 'Vou me atrasar alguns minutos, já estou a caminho' END
        WHEN 'customer' THEN CASE p_code
            WHEN 'coming'  THEN 'Já estou descendo!'
            WHEN 'porter'  THEN 'Deixe com o porteiro, por favor'
            WHEN 'wait'    THEN 'Aguarde um minuto, já vou' END
    END
$$;

-- quem pode ver a conversa de uma entrega (a tabela ride_requests não é pública, então a regra mora numa função)
CREATE OR REPLACE FUNCTION public._can_see_delivery(p_ride uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.ride_requests r JOIN public.orders o ON o.id = r.order_id JOIN public.stores s ON s.id = o.store_id
         WHERE r.id = p_ride AND (r.driver_id = auth.uid() OR o.buyer_id = auth.uid() OR s.owner_id = auth.uid()))
$$;
REVOKE ALL ON FUNCTION public._can_see_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._can_see_delivery(uuid) TO authenticated;
DROP POLICY IF EXISTS delivery_messages_read ON public.delivery_messages;
CREATE POLICY delivery_messages_read ON public.delivery_messages FOR SELECT TO authenticated USING (public._can_see_delivery(ride_id));
REVOKE ALL ON public.delivery_messages FROM anon, authenticated;
GRANT SELECT ON public.delivery_messages TO authenticated;
GRANT ALL ON public.delivery_messages TO service_role;

CREATE OR REPLACE FUNCTION public.send_delivery_message(p_ride uuid, p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    uid uuid := auth.uid();
    r public.ride_requests; o public.orders; s public.stores;
    v_role text; v_text text; v_id uuid; v_name text; v_cust text; v_other uuid;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta' USING ERRCODE = '42501'; END IF;
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride;
    IF NOT FOUND OR r.order_id IS NULL THEN RAISE EXCEPTION 'Entrega não encontrada' USING ERRCODE = '42501'; END IF;
    SELECT * INTO o FROM public.orders WHERE id = r.order_id;
    SELECT * INTO s FROM public.stores WHERE id = o.store_id;
    IF r.driver_id = uid THEN v_role := 'driver'; v_other := o.buyer_id;
    ELSIF o.buyer_id = uid THEN v_role := 'customer'; v_other := r.driver_id;
    ELSE RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.status <> 'accepted' OR r.ride_started_at IS NULL THEN RAISE EXCEPTION 'A conversa vale durante a entrega (depois da retirada do pedido).'; END IF;
    v_text := public._delivery_msg_text(p_code, v_role);
    IF v_text IS NULL THEN RAISE EXCEPTION 'Mensagem inválida' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.delivery_messages WHERE ride_id = p_ride AND sender_id = uid AND code = p_code AND created_at > now() - interval '30 seconds') THEN
        RETURN jsonb_build_object('ok', true, 'duplicate', true);
    END IF;
    IF (SELECT count(*) FROM public.delivery_messages WHERE ride_id = p_ride AND sender_id = uid AND created_at > now() - interval '10 minutes') >= 8 THEN
        RAISE EXCEPTION 'Muitas mensagens seguidas. Aguarde um pouco.';
    END IF;
    INSERT INTO public.delivery_messages (ride_id, sender_id, sender_role, code) VALUES (p_ride, uid, v_role, p_code) RETURNING id INTO v_id;
    v_name := public._person_label(uid);
    IF v_other IS NOT NULL THEN
        PERFORM public._notify(v_other, 'delivery_message', uid, p_ride,
            jsonb_build_object('title', v_name, 'text', v_name || ': ' || v_text, 'path', CASE WHEN v_role = 'driver' THEN '/carrinho?aba=pedidos' ELSE '/entregas' END, 'ride_id', p_ride,
                'reply_code', CASE WHEN v_role = 'driver' THEN 'coming' END, 'reply_label', CASE WHEN v_role = 'driver' THEN 'Já estou descendo' END),
            'dm:' || v_id);
    END IF;
    -- problema na entrega: a LOJA também fica sabendo (ela tem como falar com o cliente)
    IF v_role = 'driver' AND p_code IN ('cant_find', 'no_answer') THEN
        v_cust := public._person_label(o.buyer_id);
        PERFORM public._notify(s.owner_id, 'delivery_issue', uid, p_ride,
            jsonb_build_object('title', 'Entrega com problema', 'text', v_name || ' com ' || v_cust || ': ' || CASE p_code WHEN 'cant_find' THEN 'não encontra o endereço' ELSE 'ninguém atende na porta' END, 'path', '/painel-loja/' || s."storeSlug", 'store_id', s.id),
            'di:' || v_id);
    END IF;
    RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.send_delivery_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_delivery_message(uuid, text) TO authenticated;

-- o aviso "Estou no local" já leva a resposta de um toque para o cliente
CREATE OR REPLACE FUNCTION public.trg_notify_delivery_arrival() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    o public.orders; s public.stores; v_driver text;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    SELECT * INTO s FROM public.stores WHERE id = o.store_id;
    v_driver := public._person_label(NEW.driver_id);
    PERFORM public._notify(o.buyer_id, 'delivery_at_door', NEW.driver_id, NEW.id,
        jsonb_build_object('title', v_driver || ' chegou', 'text', v_driver || ' está no seu endereço com o pedido da ' || COALESCE(s.name, 'loja') || ' — vá receber', 'path', '/carrinho?aba=pedidos', 'store', s.name,
            'ride_id', NEW.id, 'reply_code', 'coming', 'reply_label', 'Já estou descendo'),
        'r:' || NEW.id || ':door');
    RETURN NEW;
END $$;
