-- PUSH DOS AVISOS DA ILHA (app fechado): os eventos "ao vivo" de entrega e favoritos que já aparecem na ilha agora também chegam como notificação do aparelho.
--   Cada INSERT em profile_notifications de um desses tipos "cutuca" a mesma rota que processa a fila de entregas (notify_url, pg_net), que reivindica as linhas ainda
--   sem push (push_sent_at nulo, até 10 min de idade), marca ANTES de enviar e manda Web Push + push nativo. A lista de tipos mora aqui e em src/lib/livePush.ts
--   (npm run test:live-push confere que são a mesma). Pedidos (order_*), corrida escolhida, avaliações, agenda e social NÃO entram: já têm push próprio ou ficam só na lista.
-- Rollback: supabase/rollbacks/live_push_rollback.sql

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
REVOKE ALL ON FUNCTION public.trg_ping_live_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profile_notifications_live_push ON public.profile_notifications;
CREATE TRIGGER profile_notifications_live_push AFTER INSERT ON public.profile_notifications FOR EACH ROW EXECUTE FUNCTION public.trg_ping_live_push();
