-- 20261130000118_private_store_gaps.sql — LOJA PRIVADA, as pontas soltas (23/11/2026): o PUSH dos avisos de "pedido para ser cliente"
-- e "você foi aceito", e as funções públicas que ainda mostravam algo de uma loja privada a quem não é cliente aprovado:
-- o Clube VIP (get_club_info), os cartões compartilhados no chat (get_share_cards) e o sumário/prévias dos digitais.
-- Rollback: supabase/rollbacks/private_store_gaps_rollback.sql

-- push: os dois avisos novos entram na lista do gatilho (a mesma de lib/livePushPayload.ts)
CREATE OR REPLACE FUNCTION public.trg_ping_live_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.kind = ANY (ARRAY[
        'delivery_driver_assigned', 'delivery_picked_up', 'delivery_at_door', 'delivery_message', 'delivery_issue',
        'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_driver_cancelled', 'delivery_cancelled',
        'delivery_order_ready', 'delivery_completed',
        'favorite_invite', 'favorite_accepted', 'favorite_declined',
        'dues_update', 'dispute_update',
        'moderation_update',
        'ride_offer_new', 'ride_offer_declined', 'ride_offer_agreed', 'ride_offer_expired',
        'ride_wait_requested', 'ride_wait_started', 'ride_wait_declined', 'ride_wait_ended',
        'order_waiting_store', 'order_store_timeout', 'order_customer_cancelled',
        'delivery_driver_idle', 'delivery_driver_waiting', 'delivery_late', 'delivery_quit_blocked', 'store_reject_warning',
        'order_no_driver', 'order_payment',
        'store_client_request', 'store_client_approved'
    ]) THEN
        PERFORM public._ping_delivery_events();
    END IF;
    RETURN NEW;
END; $function$;

DO $$ BEGIN
    IF to_regprocedure('public._get_club_info_all(uuid)') IS NULL THEN ALTER FUNCTION public.get_club_info(uuid) RENAME TO _get_club_info_all; END IF;
    IF to_regprocedure('public._get_share_cards_all(uuid[],uuid[],uuid[])') IS NULL THEN ALTER FUNCTION public.get_share_cards(uuid[], uuid[], uuid[]) RENAME TO _get_share_cards_all; END IF;
    IF to_regprocedure('public._get_digital_curriculum_all(uuid)') IS NULL THEN ALTER FUNCTION public.get_digital_curriculum(uuid) RENAME TO _get_digital_curriculum_all; END IF;
    IF to_regprocedure('public._get_digital_audio_preview_all(uuid)') IS NULL THEN ALTER FUNCTION public.get_digital_audio_preview(uuid) RENAME TO _get_digital_audio_preview_all; END IF;
    IF to_regprocedure('public._get_digital_book_preview_all(uuid)') IS NULL THEN ALTER FUNCTION public.get_digital_book_preview(uuid) RENAME TO _get_digital_book_preview_all; END IF;
END $$;
REVOKE ALL ON FUNCTION public._get_club_info_all(uuid), public._get_share_cards_all(uuid[], uuid[], uuid[]), public._get_digital_curriculum_all(uuid), public._get_digital_audio_preview_all(uuid), public._get_digital_book_preview_all(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_club_info(p_store uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE WHEN public._store_visible(p_store) THEN public._get_club_info_all(p_store) ELSE NULL END
$$;
-- cartões no chat: o que é de loja privada que a pessoa não pode ver simplesmente não vira cartão
CREATE OR REPLACE FUNCTION public.get_share_cards(p_products uuid[], p_stores uuid[], p_profiles uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT public._get_share_cards_all(
        ARRAY(SELECT x FROM unnest(coalesce(p_products, '{}'::uuid[])) x WHERE NOT public._private_hidden(x)),
        ARRAY(SELECT x FROM unnest(coalesce(p_stores, '{}'::uuid[])) x WHERE NOT public._private_hidden(x)),
        p_profiles)
$$;
CREATE OR REPLACE FUNCTION public.get_digital_curriculum(p_product uuid)
RETURNS TABLE(id uuid, module_title text, title text, kind text, duration_seconds integer, size_bytes bigint, "position" integer, is_preview boolean, unlocked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT * FROM public._get_digital_curriculum_all(p_product) WHERE NOT public._private_hidden(p_product)
$$;
CREATE OR REPLACE FUNCTION public.get_digital_audio_preview(p_product uuid)
RETURNS TABLE(item_id uuid, duration_seconds integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT * FROM public._get_digital_audio_preview_all(p_product) WHERE NOT public._private_hidden(p_product)
$$;
CREATE OR REPLACE FUNCTION public.get_digital_book_preview(p_product uuid)
RETURNS TABLE(item_id uuid, pages integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT * FROM public._get_digital_book_preview_all(p_product) WHERE NOT public._private_hidden(p_product)
$$;
GRANT EXECUTE ON FUNCTION public.get_club_info(uuid), public.get_share_cards(uuid[], uuid[], uuid[]), public.get_digital_curriculum(uuid), public.get_digital_audio_preview(uuid), public.get_digital_book_preview(uuid) TO anon, authenticated;

-- pegar GRÁTIS um digital de loja privada: só cliente aprovado (o produto nem aparece, mas o id podia circular)
CREATE OR REPLACE FUNCTION public.private_store_claim_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF public._private_hidden(NEW.product_id) THEN
        RAISE EXCEPTION 'Este conteúdo é de uma loja privada: só clientes aprovados podem pegar.' USING ERRCODE = '42501', HINT = 'private_store';
    END IF;
    RETURN NEW;
END $$;
DO $$ BEGIN
    IF to_regclass('public.digital_claims') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS a_digital_claims_private_store ON public.digital_claims;
        CREATE TRIGGER a_digital_claims_private_store BEFORE INSERT ON public.digital_claims FOR EACH ROW EXECUTE FUNCTION public.private_store_claim_guard();
    END IF;
END $$;
