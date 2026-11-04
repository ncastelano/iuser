-- AVISOS DA NEGOCIAÇÃO NA ILHA (e no push): cada vez que o outro lado manda uma proposta, recusa, aceita ou deixa expirar, a pessoa é avisada na hora.
-- Depende da 20261130000038 (ride_price_offers). Os avisos são linhas de profile_notifications: a ilha (3.0) / pílula (2.0) as mostra pelo
-- SystemEventsListener (lib/islandEvents.ts) e o push do aparelho sai pelo mesmo gatilho dos outros avisos "ao vivo".

ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup', 'service_application',
    'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review',
    'customer_review', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered',
    'delivery_driver_assigned', 'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready',
    'delivery_completed', 'delivery_done', 'delivery_driver_cancelled', 'delivery_cancelled', 'delivery_at_door', 'delivery_message', 'delivery_issue',
    'favorite_invite', 'favorite_accepted', 'favorite_declined', 'dues_update', 'dispute_update', 'moderation_update',
    'ride_offer_new', 'ride_offer_declined', 'ride_offer_agreed', 'ride_offer_expired'
]));

-- os novos tipos também viram push (a MESMA lista de src/lib/livePushPayload.ts)
CREATE OR REPLACE FUNCTION public.trg_ping_live_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.kind = ANY (ARRAY[
        'delivery_driver_assigned', 'delivery_picked_up', 'delivery_at_door', 'delivery_message', 'delivery_issue',
        'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_driver_cancelled', 'delivery_cancelled',
        'delivery_order_ready', 'delivery_completed',
        'favorite_invite', 'favorite_accepted', 'favorite_declined',
        'dues_update', 'dispute_update',
        'moderation_update',
        'ride_offer_new', 'ride_offer_declined', 'ride_offer_agreed', 'ride_offer_expired'
    ]) THEN
        PERFORM public._ping_delivery_events();
    END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public._neg_money(p numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'R$ ' || replace(to_char(p, 'FM999990D00'), '.', ',') $$;
REVOKE ALL ON FUNCTION public._neg_money(numeric) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_notify_ride_price_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    a public.ride_applications; r public.ride_requests; v_driver text; v_n integer;
    v_to_driver_path text; v_to_pass_path text := '/pedir-motorista';
BEGIN
    IF NEW.application_id IS NULL THEN RETURN NEW; END IF;      -- a oferta geral do passageiro já chega aos motoristas pelo card e pelo aviso de corrida nova
    SELECT * INTO a FROM public.ride_applications WHERE id = NEW.application_id;
    SELECT * INTO r FROM public.ride_requests WHERE id = NEW.ride_request_id;
    IF a.id IS NULL OR r.id IS NULL THEN RETURN NEW; END IF;
    v_to_driver_path := '/aceitar-corridas?aba=candidatos&ride=' || r.id;
    SELECT COALESCE(NULLIF(split_part(name, ' ', 1), ''), '@' || "profileSlug", 'O motorista') INTO v_driver FROM public.profiles WHERE id = a.applicant_id;

    IF TG_OP = 'INSERT' THEN
        IF NEW.author_role = 'passenger' THEN
            PERFORM public._notify(a.applicant_id, 'ride_offer_new', NEW.author_id, r.id,
                jsonb_build_object('title', 'Nova oferta do passageiro', 'text', 'O passageiro ofereceu ' || public._neg_money(NEW.amount) || ' pela corrida. Você tem poucos minutos para responder.', 'path', v_to_driver_path, 'ride_id', r.id),
                'rpo:' || NEW.id || ':new');
        ELSE
            SELECT count(*) INTO v_n FROM public.ride_price_offers WHERE application_id = NEW.application_id AND author_role = 'driver';
            IF v_n > 1 THEN   -- a 1ª proposta é a candidatura (já tem o aviso "motorista se candidatou")
                PERFORM public._notify(r.requester_id, 'ride_offer_new', NEW.author_id, r.id,
                    jsonb_build_object('title', 'Contraproposta do motorista', 'text', v_driver || ' propôs ' || public._neg_money(NEW.amount) || ' pela corrida.', 'path', v_to_pass_path, 'ride_id', r.id),
                    'rpo:' || NEW.id || ':new');
            END IF;
        END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'declined' THEN
            PERFORM public._notify(NEW.author_id, 'ride_offer_declined', NULL, r.id,
                jsonb_build_object('title', 'Proposta recusada', 'text', 'Sua proposta de ' || public._neg_money(NEW.amount) || ' foi recusada.', 'path', CASE WHEN NEW.author_role = 'passenger' THEN v_to_pass_path ELSE v_to_driver_path END, 'ride_id', r.id),
                'rpo:' || NEW.id || ':declined');
        ELSIF NEW.status = 'expired' THEN
            PERFORM public._notify(NEW.author_id, 'ride_offer_expired', NULL, r.id,
                jsonb_build_object('title', 'Proposta expirou', 'text', 'Sua proposta de ' || public._neg_money(NEW.amount) || ' não foi respondida a tempo.', 'path', CASE WHEN NEW.author_role = 'passenger' THEN v_to_pass_path ELSE v_to_driver_path END, 'ride_id', r.id),
                'rpo:' || NEW.id || ':expired');
        ELSIF NEW.status = 'accepted' AND NEW.author_role = 'passenger' THEN
            -- o motorista aceitou a oferta do passageiro (quando o passageiro escolhe o motorista, o aviso é o "Você foi escolhido" de sempre)
            PERFORM public._notify(NEW.author_id, 'ride_offer_agreed', a.applicant_id, r.id,
                jsonb_build_object('title', 'Valor combinado', 'text', v_driver || ' aceitou ' || public._neg_money(NEW.amount) || '. A corrida está confirmada.', 'path', v_to_pass_path, 'ride_id', r.id),
                'rpo:' || NEW.id || ':agreed');
        END IF;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_price_offers_notify ON public.ride_price_offers;
CREATE TRIGGER ride_price_offers_notify AFTER INSERT OR UPDATE OF status ON public.ride_price_offers
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_ride_price_offer();
