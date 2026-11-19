-- Rollback de 20261130000074_order_payments.sql: volta as funções do caixa às versões anteriores e apaga o pagamento do pedido, os fretes devidos e os acertos.
-- ATENÇÃO: apaga os registros de pagamento (order_payments), os fretes (store_dues kind 'freight') e os acertos (dues_settlements).
BEGIN;
DROP TRIGGER IF EXISTS ride_requests_zz_fill_payment ON public.ride_requests;
DROP TRIGGER IF EXISTS orders_zz_payment_create ON public.orders;
DROP TRIGGER IF EXISTS orders_zz_payment_follow ON public.orders;
DROP FUNCTION IF EXISTS public.fill_delivery_ride_payment();
DROP FUNCTION IF EXISTS public.trg_order_payment_create();
DROP FUNCTION IF EXISTS public._order_payment_ensure(public.orders);
DROP FUNCTION IF EXISTS public.trg_order_payment_follow();
DROP FUNCTION IF EXISTS public.get_store_payment_link(uuid);
DROP FUNCTION IF EXISTS public.set_store_payment_link(uuid,text);
DROP FUNCTION IF EXISTS public.get_order_payment(uuid);
DROP FUNCTION IF EXISTS public.get_store_order_payments(uuid);
DROP FUNCTION IF EXISTS public.report_order_paid(uuid);
DROP FUNCTION IF EXISTS public.confirm_order_payment(uuid,boolean,text);
DROP FUNCTION IF EXISTS public.start_door_pix(uuid);
DROP FUNCTION IF EXISTS public.driver_report_door_pix(uuid);
DROP FUNCTION IF EXISTS public._dues_pair_balance(uuid,uuid);
DROP FUNCTION IF EXISTS public.get_dues_pair_target(uuid,uuid);
DROP FUNCTION IF EXISTS public.settle_dues_pair(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.confirm_dues_settlement(uuid,boolean,text);
DROP FUNCTION IF EXISTS public.store_declare_freight(uuid,text);
DROP FUNCTION IF EXISTS public.driver_confirm_freight(uuid,boolean,text);
DROP FUNCTION IF EXISTS public.get_freight_pay_target(uuid);
DELETE FROM public.store_dues WHERE kind = 'freight';
UPDATE public.store_dues SET declare_method = 'pix' WHERE declare_method = 'saldo';
ALTER TABLE public.store_dues DROP COLUMN IF EXISTS settlement_id;
DROP TABLE IF EXISTS public.dues_settlements;
DROP TABLE IF EXISTS public.order_payments;
DROP TABLE IF EXISTS public.store_payment_links;
ALTER TABLE public.store_dues DROP CONSTRAINT IF EXISTS store_dues_kind_check;
ALTER TABLE public.store_dues ADD CONSTRAINT store_dues_kind_check CHECK (kind IN ('cash', 'machine', 'dispute_debt'));
ALTER TABLE public.store_dues DROP CONSTRAINT IF EXISTS store_dues_declare_method_check;
ALTER TABLE public.store_dues ADD CONSTRAINT store_dues_declare_method_check CHECK (declare_method IN ('pix', 'em_maos', 'devolvida'));
DROP INDEX IF EXISTS public.store_dues_freight_once;
DELETE FROM public.profile_notifications WHERE kind = 'order_payment';
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK ((kind = ANY ('{appointment_cancelled,appointment_changed,appointment_confirmed,appointment_new,comment_like,comment_reply,customer_review,delivery_at_door,delivery_cancelled,delivery_completed,delivery_done,delivery_driver_accepted,delivery_driver_arrived,delivery_driver_assigned,delivery_driver_cancelled,delivery_driver_idle,delivery_driver_waiting,delivery_issue,delivery_late,delivery_message,delivery_order_preparing,delivery_order_ready,delivery_picked_up,delivery_quit_blocked,digital_access_released,digital_order_new,dispute_update,dues_update,favorite_accepted,favorite_declined,favorite_invite,follow,group_invite,invite_signup,link_visit,moderation_update,order_accepted,order_customer_cancelled,order_delivered,order_new,order_no_driver,order_ready,order_rejected,order_store_timeout,order_waiting_store,product_like,profile_comment,profile_view,publication_comment,publication_like,ride_application,ride_offer_agreed,ride_offer_declined,ride_offer_expired,ride_offer_new,ride_review,ride_selected,ride_wait_declined,ride_wait_ended,ride_wait_requested,ride_wait_started,service_application,service_completed,service_like,service_review,service_selected,store_reject_warning}'::text[])));
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
        'delivery_driver_idle', 'delivery_driver_waiting', 'delivery_late', 'delivery_quit_blocked', 'store_reject_warning'
    ]) THEN
        PERFORM public._ping_delivery_events();
    END IF;
    RETURN NEW;
END; $function$

;
CREATE OR REPLACE FUNCTION public.trg_dues_on_ride_end()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders; cfg public.delivery_dues_settings; v_amount numeric; v_id uuid; v_store text;
BEGIN
    IF NEW.order_id IS NULL OR NEW.driver_id IS NULL OR OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status NOT IN ('completed', 'cancelled') THEN RETURN NEW; END IF;
    IF NEW.status = 'completed' THEN
        SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
        IF o.payment_method IN ('dinheiro', 'money') THEN
            -- o entregador recebeu o TOTAL, fica com o frete e repassa o resto (o valor dos produtos) à loja
            v_amount := COALESCE(o.total_amount, 0) - COALESCE(NEW.offered_price, 0);
            IF v_amount > 0 THEN
                SELECT * INTO cfg FROM public.delivery_dues_settings WHERE id;
                INSERT INTO public.store_dues (kind, store_id, driver_id, order_id, ride_id, amount, collected, due_at)
                VALUES ('cash', NEW.store_id, NEW.driver_id, NEW.order_id, NEW.id, v_amount, o.total_amount, now() + make_interval(hours => cfg.cash_due_hours))
                ON CONFLICT (ride_id) WHERE kind = 'cash' DO NOTHING RETURNING id INTO v_id;
                IF v_id IS NOT NULL THEN
                    SELECT name INTO v_store FROM public.stores WHERE id = NEW.store_id;
                    PERFORM public._notify(NEW.driver_id, 'dues_update', NULL, v_id,
                        jsonb_build_object('title', 'Repasse à loja', 'text', 'Você recebeu ' || public._brl(o.total_amount) || ' em dinheiro: repasse ' || public._brl(v_amount) || ' à ' || COALESCE(v_store, 'loja') || ' (o frete é seu).', 'path', '/entregas'),
                        'cash:' || v_id);
                END IF;
            END IF;
        END IF;
    END IF;
    IF NEW.store_id IS NOT NULL THEN PERFORM public._machine_recompute(NEW.store_id, NEW.driver_id); END IF;
    RETURN NEW;
END; $function$

;
CREATE OR REPLACE FUNCTION public.trg_dues_machine_out()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders; v_id uuid; v_name text; v_owner uuid;
BEGIN
    IF NEW.order_id IS NULL OR NEW.driver_id IS NULL OR NEW.store_id IS NULL OR NOT (OLD.ride_started_at IS NULL AND NEW.ride_started_at IS NOT NULL) THEN RETURN NEW; END IF;
    SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
    IF o.payment_method NOT IN ('cartao', 'credit_card') THEN RETURN NEW; END IF;
    INSERT INTO public.store_dues (kind, store_id, driver_id, order_id, ride_id) VALUES ('machine', NEW.store_id, NEW.driver_id, NEW.order_id, NEW.id)
    ON CONFLICT (store_id, driver_id) WHERE kind = 'machine' AND status IN ('open', 'declared', 'disputed') DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
        SELECT split_part(COALESCE(name, 'O entregador'), ' ', 1) INTO v_name FROM public.profiles WHERE id = NEW.driver_id;
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
        PERFORM public._notify(v_owner, 'dues_update', NEW.driver_id, v_id,
            jsonb_build_object('title', 'Maquininha com o entregador', 'text', v_name || ' saiu com a maquininha para um pedido no cartão', 'path', public._store_slug_path(NEW.store_id)),
            'mach-out:' || v_id);
    END IF;
    RETURN NEW;
END; $function$

;
CREATE OR REPLACE FUNCTION public._driver_dues_block(p_driver uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE cfg public.delivery_dues_settings; v_open numeric;
BEGIN
    SELECT * INTO cfg FROM public.delivery_dues_settings WHERE id;
    IF EXISTS (SELECT 1 FROM public.store_dues WHERE driver_id = p_driver AND status = 'disputed') THEN RETURN 'dues_disputed'; END IF;
    IF EXISTS (SELECT 1 FROM public.store_dues WHERE driver_id = p_driver AND kind IN ('cash', 'dispute_debt') AND status = 'open' AND due_at < now()) THEN RETURN 'cash_overdue'; END IF;
    IF EXISTS (SELECT 1 FROM public.store_dues WHERE driver_id = p_driver AND kind = 'machine' AND status = 'open' AND due_at < now()) THEN RETURN 'machine_overdue'; END IF;
    SELECT COALESCE(sum(amount), 0) INTO v_open FROM public.store_dues WHERE driver_id = p_driver AND kind IN ('cash', 'dispute_debt') AND status = 'open';
    IF v_open >= cfg.cash_max_open THEN RETURN 'cash_limit'; END IF;
    IF (SELECT count(*) FROM public.delivery_disputes WHERE driver_id = p_driver AND outcome = 'driver_at_fault' AND decided_at > now() - make_interval(days => cfg.strike_days)) >= cfg.strike_limit THEN RETURN 'dispute_strikes'; END IF;
    RETURN NULL;
END; $function$

;
CREATE OR REPLACE FUNCTION public.get_my_dues()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); cfg public.delivery_dues_settings; v_items jsonb; v_block text; v_open numeric;
BEGIN
    IF uid IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO cfg FROM public.delivery_dues_settings WHERE id;
    SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at), '[]'::jsonb) INTO v_items FROM (
        SELECT d.id, d.kind, d.store_id, s.name AS store_name, d.amount, d.status, d.due_at, d.declared_at, d.declare_method, d.note, d.created_at,
               (d.status = 'open' AND d.due_at < now()) AS overdue
          FROM public.store_dues d JOIN public.stores s ON s.id = d.store_id
         WHERE d.driver_id = uid AND d.status IN ('open', 'declared', 'disputed')) x;
    SELECT COALESCE(sum(amount), 0) INTO v_open FROM public.store_dues WHERE driver_id = uid AND kind IN ('cash', 'dispute_debt') AND status = 'open';
    v_block := public._driver_dues_block(uid);
    RETURN jsonb_build_object('blocked', v_block, 'blocked_text', CASE WHEN v_block IS NULL THEN NULL ELSE public._dues_block_message(v_block) END,
                              'open_amount', v_open, 'max_open', cfg.cash_max_open, 'items', v_items);
END; $function$

;
CREATE OR REPLACE FUNCTION public.get_store_dues(p_store uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_items jsonb; v_pending numeric;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at), '[]'::jsonb) INTO v_items FROM (
        SELECT d.id, d.kind, d.driver_id, p.name AS driver_name, p."profileSlug" AS driver_slug, d.amount, d.status, d.due_at, d.declared_at, d.declare_method, d.note, d.created_at,
               (d.status = 'open' AND d.due_at < now()) AS overdue
          FROM public.store_dues d JOIN public.profiles p ON p.id = d.driver_id
         WHERE d.store_id = p_store AND d.status IN ('open', 'declared', 'disputed')) x;
    SELECT COALESCE(sum(amount), 0) INTO v_pending FROM public.store_dues WHERE store_id = p_store AND kind IN ('cash', 'dispute_debt') AND status IN ('open', 'declared', 'disputed');
    RETURN jsonb_build_object('items', v_items, 'pending_amount', v_pending);
END; $function$

;
CREATE OR REPLACE FUNCTION public.confirm_due(p_due uuid, p_ok boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); d public.store_dues; v_store_name text;
BEGIN
    SELECT d2.* INTO d FROM public.store_dues d2 JOIN public.stores s ON s.id = d2.store_id WHERE d2.id = p_due AND s.owner_id = uid FOR UPDATE OF d2;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF d.status NOT IN ('open', 'declared') THEN RETURN; END IF;
    SELECT name INTO v_store_name FROM public.stores WHERE id = d.store_id;
    IF p_ok THEN
        UPDATE public.store_dues SET status = 'confirmed', confirmed_at = now(), updated_at = now() WHERE id = p_due;
        PERFORM public._notify(d.driver_id, 'dues_update', uid, p_due, jsonb_build_object('title', 'Confirmado pela loja', 'text', COALESCE(v_store_name, 'A loja') || ' confirmou ' || CASE WHEN d.kind = 'machine' THEN 'a devolução da maquininha.' ELSE 'o repasse de ' || public._brl(d.amount) || '.' END, 'path', '/entregas'), 'conf:' || p_due);
    ELSE
        IF btrim(COALESCE(p_note, '')) = '' THEN RAISE EXCEPTION 'Diga o que aconteceu' USING ERRCODE = '22023'; END IF;
        UPDATE public.store_dues SET status = 'disputed', note = left(btrim(p_note), 500), updated_at = now() WHERE id = p_due;
        PERFORM public._notify(d.driver_id, 'dues_update', uid, p_due, jsonb_build_object('title', 'Loja contestou', 'text', COALESCE(v_store_name, 'A loja') || ' diz que não recebeu ' || CASE WHEN d.kind = 'machine' THEN 'a maquininha.' ELSE 'o repasse de ' || public._brl(d.amount) || '.' END || ' Resolva no Caixa.', 'path', '/entregas'), 'disp:' || p_due || ':' || floor(extract(epoch FROM now()))::text);
    END IF;
END; $function$

;
CREATE OR REPLACE FUNCTION public.declare_due(p_due uuid, p_method text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); d public.store_dues; v_owner uuid; v_name text; v_txt text;
BEGIN
    SELECT * INTO d FROM public.store_dues WHERE id = p_due AND driver_id = uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF d.status NOT IN ('open', 'disputed') THEN RETURN; END IF;
    IF (d.kind = 'machine' AND p_method <> 'devolvida') OR (d.kind <> 'machine' AND p_method NOT IN ('pix', 'em_maos')) THEN RAISE EXCEPTION 'Forma inválida' USING ERRCODE = '22023'; END IF;
    UPDATE public.store_dues SET status = 'declared', declare_method = p_method, declared_at = now(), updated_at = now() WHERE id = p_due;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = d.store_id;
    SELECT split_part(COALESCE(name, 'O entregador'), ' ', 1) INTO v_name FROM public.profiles WHERE id = uid;
    v_txt := CASE WHEN d.kind = 'machine' THEN v_name || ' diz que devolveu a maquininha. Confira e confirme.'
                  ELSE v_name || ' diz que repassou ' || public._brl(d.amount) || ' ' || CASE p_method WHEN 'pix' THEN 'por Pix' ELSE 'em mãos' END || '. Confirme se recebeu.' END;
    PERFORM public._notify(v_owner, 'dues_update', uid, p_due, jsonb_build_object('title', CASE WHEN d.kind = 'machine' THEN 'Maquininha devolvida?' ELSE 'Repasse a confirmar' END, 'text', v_txt, 'path', public._store_slug_path(d.store_id)), 'decl:' || p_due || ':' || floor(extract(epoch FROM now()))::text);
END; $function$

;
COMMIT;
