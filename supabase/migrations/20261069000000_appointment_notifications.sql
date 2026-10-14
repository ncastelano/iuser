-- Agendamentos nas "Notificações do perfil": agendamento novo (convite ou pedido de horário), confirmado, cancelado e
-- horário alterado. O gatilho grava UMA linha por evento (chave anti-repetição) e a rota de push só envia o que ainda
-- não foi avisado no aparelho (push_sent_at) — um registro, um push, sem duplicar.
ALTER TABLE public.profile_notifications ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;

ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind IN (
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup',
    'service_application', 'service_selected', 'service_completed', 'service_review',
    'ride_application', 'ride_selected', 'ride_review', 'customer_review',
    'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed'
));

CREATE OR REPLACE FUNCTION public.trg_notify_appointment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_creator uuid;
    v_other uuid;
    v_meta jsonb;
    v_p uuid;
BEGIN
    -- Compromisso pessoal (dono = cliente) e o espelho do remetente: ninguém a avisar
    IF NEW.owner_id IS NOT DISTINCT FROM NEW.customer_id THEN RETURN NEW; END IF;

    -- Quem criou: 'outgoing' = o cliente (pediu horário); o resto = o dono (convidou)
    IF NEW.direction = 'outgoing' THEN v_creator := NEW.customer_id; v_other := NEW.owner_id;
    ELSE v_creator := NEW.owner_id; v_other := NEW.customer_id; END IF;

    v_meta := jsonb_build_object(
        'title', NEW.service_name, 'store', NEW.store_name, 'store_id', NEW.store_id,
        'date', NEW.date, 'time', left(NEW.time::text, 5),
        'flow', CASE WHEN NEW.direction = 'outgoing' THEN 'booking' ELSE 'invite' END
    );

    IF TG_OP = 'INSERT' THEN
        PERFORM public._notify(v_other, 'appointment_new', v_creator, NEW.id, v_meta, 'appt:' || NEW.id || ':new');

    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'confirmed' THEN
            -- quem estava esperando a resposta (o criador) é avisado; o ator é quem confirmou
            PERFORM public._notify(v_creator, 'appointment_confirmed', COALESCE(v_actor, v_other), NEW.id, v_meta, 'appt:' || NEW.id || ':confirmed');
        ELSIF NEW.status = 'cancelled' THEN
            FOREACH v_p IN ARRAY ARRAY[NEW.owner_id, NEW.customer_id] LOOP
                PERFORM public._notify(v_p, 'appointment_cancelled', v_actor, NEW.id, v_meta, 'appt:' || NEW.id || ':cancelled');
            END LOOP;
        END IF;

    ELSIF (NEW.date IS DISTINCT FROM OLD.date OR NEW.time IS DISTINCT FROM OLD.time) AND NEW.status <> 'cancelled' THEN
        FOREACH v_p IN ARRAY ARRAY[NEW.owner_id, NEW.customer_id] LOOP
            PERFORM public._notify(v_p, 'appointment_changed', v_actor, NEW.id, v_meta,
                'appt:' || NEW.id || ':changed:' || NEW.date || ':' || left(NEW.time::text, 5));
        END LOOP;
    END IF;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS appointments_notify ON public.appointments;
CREATE TRIGGER appointments_notify AFTER INSERT OR UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.trg_notify_appointment();
