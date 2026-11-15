-- CICLO CLIENTE × LOJA × ENTREGADOR: NADA FICA PARADO PARA SEMPRE (decisão do dono, 12–14/11/2026).
-- Antes, depois que o entregador aceitava, nenhum prazo valia: loja que não aceitava, entregador que sumia e pedido "a caminho" há horas
-- ficavam assim até alguém mexer à mão. Esta migration:
--   1) RELÓGIO DE CADA ETAPA (process_delivery_cycle, pg_cron 1/min; prazos em delivery_cycle_settings, sem tela: SQL):
--      • loja não aceitou o pedido que chegou a ela → aviso aos 3 min; aos 10 min o pedido é cancelado (closed_reason 'store_timeout'),
--        o cliente e a loja são avisados e o entregador é liberado;
--      • entregador aceitou e não saiu (15 min) ou saiu e não chegou à loja (30 min) → a entrega volta a procurar outro (como a desistência);
--      • entregador na loja esperando o pedido ficar pronto há 10 min → aviso à loja;
--      • pedido a caminho do cliente há mais que o dobro do tempo previsto (mín. 30 min) → aviso ao cliente e à loja + registro para o admin.
--      Só pedidos das últimas 24 h, só o fluxo atual (V1), nunca pedido só digital (esses esperam a loja conferir o Pix).
--   2) O CLIENTE CANCELA enquanto a loja não aceitou (cancel_held_order passa a valer também para pedido já com a loja, ainda pendente).
--   3) LOJA FECHADA NÃO RECEBE PEDIDO DE ENTREGA (o banco confere o horário, como a tela: sem horário configurado = fechada).
--   4) CÓDIGO DE RETIRADA TAMBÉM PARA A EQUIPE (funcionário ativo com conta: employees.user_id).
--   5) CONTAGENS: desistências do entregador (desistir ou ser passado adiante por demora) — 3 em 7 dias pausam as entregas dele por 24 h —
--      e recusas da loja depois que o entregador já tinha aceitado — 3 em 7 dias geram um aviso à loja.
-- Tudo registrado em delivery_cycle_events (sem acesso do app). Rollback: supabase/rollbacks/delivery_cycle_guards_rollback.sql.

-- ===== configuração e registros =====
CREATE TABLE IF NOT EXISTS public.delivery_cycle_settings (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    enabled boolean NOT NULL DEFAULT true,
    store_accept_warn_min integer NOT NULL DEFAULT 3 CHECK (store_accept_warn_min BETWEEN 1 AND 120),
    store_accept_timeout_min integer NOT NULL DEFAULT 10 CHECK (store_accept_timeout_min BETWEEN 2 AND 240),
    driver_idle_min integer NOT NULL DEFAULT 15 CHECK (driver_idle_min BETWEEN 3 AND 240),
    driver_wait_warn_min integer NOT NULL DEFAULT 10 CHECK (driver_wait_warn_min BETWEEN 2 AND 240),
    transit_late_min integer NOT NULL DEFAULT 30 CHECK (transit_late_min BETWEEN 5 AND 600),
    transit_late_factor numeric(4,2) NOT NULL DEFAULT 2 CHECK (transit_late_factor BETWEEN 1 AND 10),
    quit_limit integer NOT NULL DEFAULT 3 CHECK (quit_limit BETWEEN 1 AND 50),
    quit_window_days integer NOT NULL DEFAULT 7 CHECK (quit_window_days BETWEEN 1 AND 90),
    quit_block_hours integer NOT NULL DEFAULT 24 CHECK (quit_block_hours BETWEEN 1 AND 720),
    store_reject_limit integer NOT NULL DEFAULT 3 CHECK (store_reject_limit BETWEEN 1 AND 50),
    store_reject_window_days integer NOT NULL DEFAULT 7 CHECK (store_reject_window_days BETWEEN 1 AND 90),
    CHECK (store_accept_warn_min < store_accept_timeout_min)
);
INSERT INTO public.delivery_cycle_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.delivery_cycle_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('store_warned', 'store_timeout', 'customer_cancelled', 'driver_idle_released', 'driver_quit', 'quit_blocked',
                                       'driver_waiting_warned', 'transit_late', 'store_rejected_after_driver', 'store_reject_warned')),
    order_id uuid, ride_id uuid, store_id uuid, driver_id uuid,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    dedupe text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_cycle_events_driver_idx ON public.delivery_cycle_events (driver_id, created_at) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS delivery_cycle_events_store_idx ON public.delivery_cycle_events (store_id, created_at) WHERE store_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.driver_cycle_blocks (
    driver_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    until timestamptz NOT NULL,
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_cycle_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_cycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_cycle_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_cycle_settings, public.delivery_cycle_events, public.driver_cycle_blocks FROM PUBLIC, anon, authenticated;

-- quando o pedido chegou à loja (retido → liberado, ou já nasceu visível): é daí que conta o prazo de aceite
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS store_visible_at timestamptz;
CREATE OR REPLACE FUNCTION public.orders_set_store_visible_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.store_visible AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.store_visible, false)) THEN NEW.store_visible_at := now(); END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_set_store_visible_at ON public.orders;
CREATE TRIGGER orders_set_store_visible_at BEFORE INSERT OR UPDATE OF store_visible ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_set_store_visible_at();

-- novo motivo de encerramento: a loja não respondeu a tempo
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_closed_reason_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_closed_reason_check
    CHECK (closed_reason IS NULL OR closed_reason IN ('no_driver', 'customer_cancelled', 'store_timeout'));

-- novos tipos de aviso (a lista atual é lida do próprio banco, para não perder tipo nenhum)
DO $$
DECLARE def text; kinds text[];
BEGIN
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
     WHERE conrelid = 'public.profile_notifications'::regclass AND conname = 'profile_notifications_kind_check';
    -- lê os nomes nos DOIS formatos que o Postgres usa: ARRAY['a'::text, ...] e '{a,b}'::text[] (o que esta migration grava; assim ela pode rodar de novo)
    SELECT array_agg(DISTINCT m[1]) INTO kinds FROM regexp_matches(COALESCE(def, ''), '([a-z][a-z0-9_]*)', 'g') AS m
     WHERE m[1] NOT IN ('kind', 'any', 'array', 'text', 'check');
    kinds := ARRAY(SELECT DISTINCT unnest(COALESCE(kinds, '{}') || ARRAY['order_waiting_store', 'order_store_timeout', 'order_customer_cancelled',
        'delivery_driver_idle', 'delivery_driver_waiting', 'delivery_late', 'delivery_quit_blocked', 'store_reject_warning']) ORDER BY 1);
    ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
    EXECUTE format('ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (%L::text[]))', kinds);
END $$;

-- os avisos novos também viram notificação do aparelho (a MESMA lista de src/lib/livePushPayload.ts; o teste confere)
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
        'ride_offer_new', 'ride_offer_declined', 'ride_offer_agreed', 'ride_offer_expired',
        'ride_wait_requested', 'ride_wait_started', 'ride_wait_declined', 'ride_wait_ended',
        'order_waiting_store', 'order_store_timeout', 'order_customer_cancelled',
        'delivery_driver_idle', 'delivery_driver_waiting', 'delivery_late', 'delivery_quit_blocked', 'store_reject_warning'
    ]) THEN
        PERFORM public._ping_delivery_events();
    END IF;
    RETURN NEW;
END; $$;

-- ===== 3) loja aberta agora? (a MESMA regra de isStoreOpenNow em src/lib/storeHours.ts, no fuso de Porto Velho) =====
CREATE OR REPLACE FUNCTION public._store_open_now(p_hours jsonb, p_at timestamptz DEFAULT now())
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE loc timestamp := p_at AT TIME ZONE 'America/Porto_Velho'; d jsonb; s int; e int; ls int; le int; cur int;
BEGIN
    IF p_hours IS NULL OR jsonb_typeof(p_hours -> 'weekly') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    -- sem nenhum dia configurado = fechada (igual à tela)
    IF NOT EXISTS (SELECT 1 FROM jsonb_each(p_hours -> 'weekly') w
                    WHERE (w.value ->> 'isOpen')::boolean IS TRUE AND COALESCE(w.value ->> 'start', '') <> '' AND COALESCE(w.value ->> 'end', '') <> '') THEN
        RETURN false;
    END IF;
    IF jsonb_typeof(p_hours -> 'blocked_dates') = 'array' AND (p_hours -> 'blocked_dates') ? to_char(loc, 'YYYY-MM-DD') THEN RETURN false; END IF;
    d := p_hours -> 'weekly' -> extract(dow FROM loc)::int::text;
    IF d IS NULL OR (d ->> 'isOpen')::boolean IS NOT TRUE OR COALESCE(d ->> 'start', '') = '' OR COALESCE(d ->> 'end', '') = '' THEN RETURN false; END IF;
    s := split_part(d ->> 'start', ':', 1)::int * 60 + split_part(d ->> 'start', ':', 2)::int;
    e := split_part(d ->> 'end', ':', 1)::int * 60 + split_part(d ->> 'end', ':', 2)::int;
    IF e = 0 THEN e := 1440; END IF;   -- meia-noite = fim do dia (00:00–00:00 = 24 horas)
    IF s >= e THEN RETURN false; END IF;
    cur := extract(hour FROM loc)::int * 60 + extract(minute FROM loc)::int;
    IF COALESCE(d ->> 'lunchStart', '') <> '' AND COALESCE(d ->> 'lunchEnd', '') <> '' THEN
        ls := split_part(d ->> 'lunchStart', ':', 1)::int * 60 + split_part(d ->> 'lunchStart', ':', 2)::int;
        le := split_part(d ->> 'lunchEnd', ':', 1)::int * 60 + split_part(d ->> 'lunchEnd', ':', 2)::int;
        IF ls < le AND ls > s AND le < e THEN
            RETURN (cur >= s AND cur < ls) OR (cur >= le AND cur < e);
        END IF;
    END IF;
    RETURN cur >= s AND cur < e;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN true;   -- horário escrito de um jeito que não dá para ler: não trava a loja por isso
END $$;

CREATE OR REPLACE FUNCTION public.orders_refuse_closed_store()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h jsonb; v_owner uuid;
BEGIN
    IF NEW.buyer_id IS NULL OR NEW.delivery_option IS DISTINCT FROM 'entrega' THEN RETURN NEW; END IF;
    SELECT business_hours, owner_id INTO h, v_owner FROM public.stores WHERE id = NEW.store_id;
    IF v_owner = NEW.buyer_id THEN RETURN NEW; END IF;
    IF NOT public._store_open_now(h) THEN
        RAISE EXCEPTION 'A loja está fechada agora. Tente de novo no horário dela.' USING ERRCODE = 'P0001', HINT = 'store_closed';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_refuse_closed_store ON public.orders;
CREATE TRIGGER orders_refuse_closed_store BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_refuse_closed_store();

-- ===== 2) o cliente cancela enquanto a loja não aceitou =====
CREATE OR REPLACE FUNCTION public.cancel_held_order(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders; s record;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND OR o.buyer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF o.status <> 'pending' THEN
        RAISE EXCEPTION 'A loja já aceitou este pedido: fale com ela pela conversa' USING HINT = 'store_accepted';
    END IF;
    UPDATE public.orders SET status = 'rejected', closed_reason = 'customer_cancelled' WHERE id = o.id;   -- o gatilho encerra a corrida e a busca
    IF o.store_visible THEN
        SELECT id, owner_id, name, "storeSlug" AS slug INTO s FROM public.stores WHERE id = o.store_id;
        PERFORM public._notify(s.owner_id, 'order_customer_cancelled', o.buyer_id, o.id,
            jsonb_build_object('title', 'Pedido cancelado', 'text', COALESCE(o.buyer_name, 'O cliente') || ' cancelou o pedido antes de você aceitar',
                               'path', '/painel-loja/' || s.slug || '/pedidos', 'store', s.name), 'o:' || o.id || ':customer_cancelled');
        INSERT INTO public.delivery_cycle_events (kind, order_id, store_id, dedupe) VALUES ('customer_cancelled', o.id, o.store_id, 'cc:' || o.id)
        ON CONFLICT (dedupe) DO NOTHING;
    END IF;
    RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.cancel_held_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_held_order(uuid) TO authenticated;

-- ===== 4) código de retirada: dono OU funcionário ativo da loja =====
CREATE OR REPLACE FUNCTION public._is_store_staff(p_store uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT auth.uid() IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store AND s.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.employees e WHERE e.store_id = p_store AND e.user_id = auth.uid() AND COALESCE(e.is_active, true)))
$$;
REVOKE ALL ON FUNCTION public._is_store_staff(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_store_pickup_codes(p_store uuid)
 RETURNS TABLE(driver_id uuid, driver_name text, driver_slug text, driver_avatar text, vehicle text, plate text, code text, expires_at timestamp with time zone, rides integer, ready integer, units numeric, items integer, locked boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public._is_store_staff(p_store) THEN
        RAISE EXCEPTION 'Só a loja (dona ou equipe) vê os códigos de retirada' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT c.driver_id, p.name, p."profileSlug", p.avatar_url,
           (SELECT concat_ws(' · ', v.vehicle_kind, v.car_model) FROM public.driver_vehicles v WHERE v.driver_id = c.driver_id ORDER BY v.delivery_capacity DESC NULLS LAST LIMIT 1),
           (SELECT v.car_plate FROM public.driver_vehicles v WHERE v.driver_id = c.driver_id ORDER BY v.delivery_capacity DESC NULLS LAST LIMIT 1),
           c.code, c.expires_at,
           count(r.id)::int, count(r.id) FILTER (WHERE o.status = 'ready')::int, COALESCE(sum(r.delivery_units), 0), COALESCE(sum(r.items_count), 0)::int,
           (c.locked_until IS NOT NULL AND c.locked_until > now())
      FROM public.delivery_pickup_codes c
      JOIN public.profiles p ON p.id = c.driver_id
      JOIN public.ride_requests r ON r.store_id = c.store_id AND r.driver_id = c.driver_id AND r.status = 'accepted' AND r.order_id IS NOT NULL AND r.driver_arrived_at IS NOT NULL AND r.ride_started_at IS NULL
      JOIN public.orders o ON o.id = r.order_id
     WHERE c.store_id = p_store AND c.used_at IS NULL AND c.expires_at > now()
     GROUP BY c.driver_id, p.name, p."profileSlug", p.avatar_url, c.code, c.expires_at, c.locked_until;
END $function$;

-- o funcionário vê, numa lista só, os códigos das lojas em que trabalha (tela "Minhas tarefas")
CREATE OR REPLACE FUNCTION public.get_my_staff_pickup_codes()
RETURNS TABLE(store_id uuid, store_name text, driver_name text, code text, expires_at timestamptz, rides integer, ready integer, locked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT s.id, s.name, p.name, c.code, c.expires_at,
           count(r.id)::int, count(r.id) FILTER (WHERE o.status = 'ready')::int,
           (c.locked_until IS NOT NULL AND c.locked_until > now())
      FROM public.employees e
      JOIN public.stores s ON s.id = e.store_id
      JOIN public.delivery_pickup_codes c ON c.store_id = s.id AND c.used_at IS NULL AND c.expires_at > now()
      JOIN public.profiles p ON p.id = c.driver_id
      JOIN public.ride_requests r ON r.store_id = c.store_id AND r.driver_id = c.driver_id AND r.status = 'accepted' AND r.order_id IS NOT NULL AND r.driver_arrived_at IS NOT NULL AND r.ride_started_at IS NULL
      JOIN public.orders o ON o.id = r.order_id
     WHERE auth.uid() IS NOT NULL AND e.user_id = auth.uid() AND COALESCE(e.is_active, true)
     GROUP BY s.id, s.name, p.name, c.code, c.expires_at, c.locked_until
$$;
REVOKE ALL ON FUNCTION public.get_my_staff_pickup_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_staff_pickup_codes() TO authenticated;

-- ===== 5) contagens: desistências do entregador e recusas da loja =====
CREATE OR REPLACE FUNCTION public._cycle_driver_strike(p_driver uuid, p_kind text, p_ride uuid, p_order uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg public.delivery_cycle_settings; n int; v_until timestamptz;
BEGIN
    SELECT * INTO cfg FROM public.delivery_cycle_settings WHERE id;
    INSERT INTO public.delivery_cycle_events (kind, ride_id, order_id, driver_id, dedupe)
    VALUES (p_kind, p_ride, p_order, p_driver, p_kind || ':' || p_ride || ':' || p_driver) ON CONFLICT (dedupe) DO NOTHING;
    SELECT count(*) INTO n FROM public.delivery_cycle_events
     WHERE driver_id = p_driver AND kind IN ('driver_quit', 'driver_idle_released') AND created_at > now() - make_interval(days => cfg.quit_window_days);
    IF n >= cfg.quit_limit AND NOT EXISTS (SELECT 1 FROM public.driver_cycle_blocks WHERE driver_id = p_driver AND until > now()) THEN
        v_until := now() + make_interval(hours => cfg.quit_block_hours);
        INSERT INTO public.driver_cycle_blocks (driver_id, until, reason) VALUES (p_driver, v_until, n || ' desistências em ' || cfg.quit_window_days || ' dias')
        ON CONFLICT (driver_id) DO UPDATE SET until = EXCLUDED.until, reason = EXCLUDED.reason, created_at = now();
        INSERT INTO public.delivery_cycle_events (kind, driver_id, ride_id, data, dedupe)
        VALUES ('quit_blocked', p_driver, p_ride, jsonb_build_object('until', v_until, 'count', n), 'qb:' || p_driver || ':' || p_ride) ON CONFLICT (dedupe) DO NOTHING;
        PERFORM public._notify(p_driver, 'delivery_quit_blocked', NULL, p_ride,
            jsonb_build_object('title', 'Entregas pausadas por ' || cfg.quit_block_hours || ' h',
                'text', 'Você desistiu ou demorou em ' || n || ' entregas nos últimos ' || cfg.quit_window_days || ' dias. Voltam às '
                        || to_char(v_until AT TIME ZONE 'America/Porto_Velho', 'DD/MM HH24:MI') || '.', 'path', '/entregas'),
            'qb:' || p_driver || ':' || p_ride);
    END IF;
END $$;
REVOKE ALL ON FUNCTION public._cycle_driver_strike(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- entregador pausado não aceita entrega de loja (corrida de passageiro segue livre)
CREATE OR REPLACE FUNCTION public.ride_applications_quit_block()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_until timestamptz;
BEGIN
    SELECT b.until INTO v_until FROM public.driver_cycle_blocks b WHERE b.driver_id = NEW.applicant_id AND b.until > now();
    IF v_until IS NOT NULL AND EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.id = NEW.ride_request_id AND r.order_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Suas entregas de loja estão pausadas até % por desistências seguidas', to_char(v_until AT TIME ZONE 'America/Porto_Velho', 'DD/MM HH24:MI')
            USING ERRCODE = '42501', HINT = 'quit_blocked';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ride_applications_quit_block ON public.ride_applications;
CREATE TRIGGER ride_applications_quit_block BEFORE INSERT ON public.ride_applications FOR EACH ROW EXECUTE FUNCTION public.ride_applications_quit_block();

-- a desistência (migration ...67) passa a contar; quem foi passado adiante pelo relógio já é contado lá (app.cycle_idle)
CREATE OR REPLACE FUNCTION public.ride_requests_reopen_after_driver_cancel()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE d record; v_order_status text;
BEGIN
    IF NEW.order_id IS NULL OR OLD.status <> 'accepted' OR NEW.status <> 'cancelled' OR NEW.cancelled_by IS DISTINCT FROM 'driver'
       OR OLD.ride_started_at IS NOT NULL OR OLD.driver_id IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT id, flow_version INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = NEW.id;
    IF d.id IS NULL OR d.flow_version <> 1 THEN RETURN NULL; END IF;
    SELECT status INTO v_order_status FROM public.orders WHERE id = NEW.order_id;
    IF v_order_status IS NULL OR v_order_status NOT IN ('pending', 'preparing', 'ready') THEN RETURN NULL; END IF;

    IF COALESCE(current_setting('app.cycle_idle', true), '') <> '1' THEN
        PERFORM public._cycle_driver_strike(OLD.driver_id, 'driver_quit', NEW.id, NEW.order_id);
    END IF;

    UPDATE public.ride_applications SET status = 'rejected' WHERE ride_request_id = NEW.id AND applicant_id = OLD.driver_id;
    DELETE FROM public.ride_applications WHERE ride_request_id = NEW.id AND applicant_id <> OLD.driver_id AND status = 'rejected';

    UPDATE public.ride_requests
       SET status = 'pending', driver_id = NULL, cancelled_by = NULL,
           driver_en_route = false, driver_departed_at = NULL, driver_arrived_at = NULL, arrived_destination_at = NULL,
           exclusive_until = NULL, share_closed_at = NULL, applicant_count = 0
     WHERE id = NEW.id;

    UPDATE public.order_delivery_dispatches SET status = 'searching', stage = 'searching', updated_at = now() WHERE id = d.id;

    INSERT INTO public.order_delivery_events (dispatch_id, kind, data)
    VALUES (d.id, 'round_started', jsonb_build_object('reason', 'driver_cancelled', 'driver_id', OLD.driver_id));
    PERFORM public._ping_delivery_events();
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.ride_requests_reopen_after_driver_cancel() FROM PUBLIC, anon, authenticated;

-- loja recusou um pedido que já tinha entregador: conta; no limite, a loja é avisada
CREATE OR REPLACE FUNCTION public.orders_count_reject_after_driver()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg public.delivery_cycle_settings; v_driver uuid; n int; s record;
BEGIN
    SELECT r.driver_id INTO v_driver FROM public.ride_requests r WHERE r.order_id = NEW.id AND r.driver_id IS NOT NULL ORDER BY r.created_at DESC LIMIT 1;
    IF v_driver IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO cfg FROM public.delivery_cycle_settings WHERE id;
    INSERT INTO public.delivery_cycle_events (kind, order_id, store_id, driver_id, dedupe)
    VALUES ('store_rejected_after_driver', NEW.id, NEW.store_id, v_driver, 'srad:' || NEW.id) ON CONFLICT (dedupe) DO NOTHING;
    SELECT count(*) INTO n FROM public.delivery_cycle_events
     WHERE store_id = NEW.store_id AND kind = 'store_rejected_after_driver' AND created_at > now() - make_interval(days => cfg.store_reject_window_days);
    IF n >= cfg.store_reject_limit THEN
        SELECT owner_id, name, "storeSlug" AS slug INTO s FROM public.stores WHERE id = NEW.store_id;
        INSERT INTO public.delivery_cycle_events (kind, store_id, data, dedupe)
        VALUES ('store_reject_warned', NEW.store_id, jsonb_build_object('count', n), 'srw:' || NEW.store_id || ':' || to_char(now() AT TIME ZONE 'America/Porto_Velho', 'YYYY-MM-DD'))
        ON CONFLICT (dedupe) DO NOTHING;
        PERFORM public._notify(s.owner_id, 'store_reject_warning', NULL, NEW.id,
            jsonb_build_object('title', 'Atenção às recusas', 'text', 'Você recusou ' || n || ' pedidos que já tinham entregador a caminho nos últimos '
                || cfg.store_reject_window_days || ' dias. Cada recusa faz o entregador perder a viagem.', 'path', '/painel-loja/' || s.slug || '/pedidos'),
            'srw:' || NEW.store_id || ':' || to_char(now() AT TIME ZONE 'America/Porto_Velho', 'YYYY-MM-DD'));
    END IF;
    RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS orders_zzz_count_reject_after_driver ON public.orders;
CREATE TRIGGER orders_zzz_count_reject_after_driver AFTER UPDATE OF status ON public.orders
    FOR EACH ROW WHEN (NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' AND NEW.closed_reason IS NULL)
    EXECUTE FUNCTION public.orders_count_reject_after_driver();

-- ===== 1) o relógio de cada etapa =====
CREATE OR REPLACE FUNCTION public.process_delivery_cycle()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg public.delivery_cycle_settings; ord record; r record; n_warn int := 0; n_timeout int := 0; n_idle int := 0; n_wait int := 0; n_late int := 0;
        v_driver_on boolean; v_late_min numeric;
BEGIN
    SELECT * INTO cfg FROM public.delivery_cycle_settings WHERE id;
    IF cfg IS NULL OR NOT cfg.enabled THEN RETURN jsonb_build_object('enabled', false); END IF;

    -- a) a loja não aceitou o pedido que chegou a ela
    FOR ord IN
        SELECT o.id, o.store_id, o.buyer_id, COALESCE(o.buyer_name, 'O cliente') AS buyer, COALESCE(o.store_visible_at, o.created_at) AS t0,
               s.owner_id, s.name AS store_name, s."storeSlug" AS slug
          FROM public.orders o JOIN public.stores s ON s.id = o.store_id
         WHERE o.status = 'pending' AND o.store_visible AND o.buyer_id IS NOT NULL
           AND COALESCE(o.delivery_flow_version, 1) = 1
           AND o.created_at > now() - interval '24 hours'
           AND COALESCE(o.store_visible_at, o.created_at) < now() - make_interval(mins => cfg.store_accept_warn_min)
           AND NOT EXISTS (SELECT 1 FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id WHERE oi.order_id = o.id AND p.type = 'digital')
         ORDER BY o.created_at LIMIT 200
    LOOP
        BEGIN
            IF ord.t0 < now() - make_interval(mins => cfg.store_accept_timeout_min) THEN
                UPDATE public.orders SET status = 'rejected', closed_reason = 'store_timeout' WHERE id = ord.id AND status = 'pending';
                IF FOUND THEN
                    INSERT INTO public.delivery_cycle_events (kind, order_id, store_id, dedupe) VALUES ('store_timeout', ord.id, ord.store_id, 'st:' || ord.id) ON CONFLICT (dedupe) DO NOTHING;
                    PERFORM public._notify(ord.buyer_id, 'order_store_timeout', NULL, ord.id,
                        jsonb_build_object('title', 'A loja não respondeu', 'text', ord.store_name || ' não aceitou seu pedido a tempo e ele foi cancelado. Se já pagou algo, fale com a loja.',
                            'path', '/atividade?aba=pedidos', 'store', ord.store_name), 'o:' || ord.id || ':store_timeout');
                    PERFORM public._notify(ord.owner_id, 'order_store_timeout', NULL, ord.id,
                        jsonb_build_object('title', 'Pedido cancelado sem resposta', 'text', 'O pedido de ' || ord.buyer || ' passou ' || cfg.store_accept_timeout_min || ' min sem ser aceito e foi cancelado.',
                            'path', '/painel-loja/' || ord.slug || '/pedidos', 'store', ord.store_name), 'o:' || ord.id || ':store_timeout_store');
                    n_timeout := n_timeout + 1;
                END IF;
            ELSE
                v_driver_on := EXISTS (SELECT 1 FROM public.ride_requests x WHERE x.order_id = ord.id AND x.status = 'accepted');
                INSERT INTO public.delivery_cycle_events (kind, order_id, store_id, dedupe) VALUES ('store_warned', ord.id, ord.store_id, 'sw:' || ord.id) ON CONFLICT (dedupe) DO NOTHING;
                IF FOUND THEN
                    PERFORM public._notify(ord.owner_id, 'order_waiting_store', NULL, ord.id,
                        jsonb_build_object('title', 'Pedido esperando você', 'text', ord.buyer || ' está esperando. Aceite em até ' || cfg.store_accept_timeout_min
                            || ' min ou o pedido será cancelado' || CASE WHEN v_driver_on THEN ' · o entregador já aceitou' ELSE '' END || '.',
                            'path', '/painel-loja/' || ord.slug || '/pedidos', 'store', ord.store_name), 'o:' || ord.id || ':waiting_store');
                    n_warn := n_warn + 1;
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN RAISE WARNING 'ciclo (loja) pedido %: %', ord.id, SQLERRM;
        END;
    END LOOP;

    -- b) o entregador aceitou e não saiu / saiu e não chegou à loja: a entrega volta a procurar outro
    FOR r IN
        SELECT x.id, x.driver_id, x.order_id, x.driver_departed_at,
               COALESCE((SELECT max(a.created_at) FROM public.ride_applications a WHERE a.ride_request_id = x.id AND a.applicant_id = x.driver_id AND a.status = 'accepted'), x.created_at) AS acc
          FROM public.ride_requests x
          JOIN public.order_delivery_dispatches d ON d.ride_request_id = x.id AND d.flow_version = 1
          JOIN public.orders o ON o.id = x.order_id AND o.status IN ('pending', 'preparing', 'ready')
         WHERE x.status = 'accepted' AND x.driver_id IS NOT NULL AND x.ride_started_at IS NULL AND x.driver_arrived_at IS NULL
           AND o.created_at > now() - interval '24 hours'
         LIMIT 200
    LOOP
        IF (r.driver_departed_at IS NULL AND r.acc < now() - make_interval(mins => cfg.driver_idle_min))
           OR (r.driver_departed_at IS NOT NULL AND r.driver_departed_at < now() - make_interval(mins => cfg.driver_idle_min * 2)) THEN
            BEGIN
                PERFORM set_config('app.cycle_idle', '1', true);
                PERFORM public._cycle_driver_strike(r.driver_id, 'driver_idle_released', r.id, r.order_id);
                PERFORM public._notify(r.driver_id, 'delivery_driver_idle', NULL, r.id,
                    jsonb_build_object('title', 'Entrega passada adiante',
                        'text', CASE WHEN r.driver_departed_at IS NULL THEN 'Você não saiu para a loja em ' || cfg.driver_idle_min || ' min'
                                     ELSE 'Você não chegou à loja em ' || (cfg.driver_idle_min * 2) || ' min' END || ' e a entrega foi para outro entregador.',
                        'path', '/entregas'), 'r:' || r.id || ':idle:' || r.driver_id);
                UPDATE public.ride_requests SET status = 'cancelled', cancelled_by = 'driver' WHERE id = r.id AND status = 'accepted';   -- reabre (gatilho da ...67)
                PERFORM set_config('app.cycle_idle', '', true);
                n_idle := n_idle + 1;
            EXCEPTION WHEN OTHERS THEN
                PERFORM set_config('app.cycle_idle', '', true);
                RAISE WARNING 'ciclo (entregador parado) corrida %: %', r.id, SQLERRM;
            END;
        END IF;
    END LOOP;

    -- c) o entregador está na loja esperando o pedido ficar pronto
    FOR r IN
        SELECT x.id, x.order_id, x.driver_arrived_at, s.owner_id, s.name AS store_name, s."storeSlug" AS slug,
               COALESCE(p.name, 'O entregador') AS driver, COALESCE(o.buyer_name, 'o cliente') AS buyer
          FROM public.ride_requests x
          JOIN public.orders o ON o.id = x.order_id AND o.status IN ('pending', 'preparing')
          JOIN public.stores s ON s.id = o.store_id
          LEFT JOIN public.profiles p ON p.id = x.driver_id
         WHERE x.status = 'accepted' AND x.driver_arrived_at IS NOT NULL AND x.ride_started_at IS NULL
           AND x.driver_arrived_at < now() - make_interval(mins => cfg.driver_wait_warn_min)
           AND o.created_at > now() - interval '24 hours'
         LIMIT 200
    LOOP
        INSERT INTO public.delivery_cycle_events (kind, ride_id, order_id, dedupe) VALUES ('driver_waiting_warned', r.id, r.order_id, 'dw:' || r.id) ON CONFLICT (dedupe) DO NOTHING;
        IF FOUND THEN
            PERFORM public._notify(r.owner_id, 'delivery_driver_waiting', NULL, r.order_id,
                jsonb_build_object('title', 'Entregador esperando', 'text', split_part(r.driver, ' ', 1) || ' está na loja há ' || cfg.driver_wait_warn_min
                    || ' min esperando o pedido de ' || r.buyer || '.', 'path', '/painel-loja/' || r.slug || '/pedidos', 'store', r.store_name), 'r:' || r.id || ':waiting_store');
            n_wait := n_wait + 1;
        END IF;
    END LOOP;

    -- d) o pedido está a caminho do cliente há tempo demais
    FOR r IN
        SELECT x.id, x.order_id, x.ride_started_at, x.duration_min, o.buyer_id, o.store_id, s.owner_id, s.name AS store_name, s."storeSlug" AS slug,
               COALESCE(p.name, 'O entregador') AS driver, COALESCE(o.buyer_name, 'o cliente') AS buyer
          FROM public.ride_requests x
          JOIN public.orders o ON o.id = x.order_id AND o.status IN ('preparing', 'ready')
          JOIN public.stores s ON s.id = o.store_id
          LEFT JOIN public.profiles p ON p.id = x.driver_id
         WHERE x.status = 'accepted' AND x.ride_started_at IS NOT NULL
           AND o.created_at > now() - interval '24 hours'
         LIMIT 200
    LOOP
        v_late_min := GREATEST(cfg.transit_late_min, cfg.transit_late_factor * COALESCE(r.duration_min, 15));
        IF r.ride_started_at < now() - make_interval(mins => ceil(v_late_min)::int) THEN
            INSERT INTO public.delivery_cycle_events (kind, ride_id, order_id, store_id, data, dedupe)
            VALUES ('transit_late', r.id, r.order_id, r.store_id, jsonb_build_object('minutes', round(extract(epoch FROM now() - r.ride_started_at) / 60)), 'tl:' || r.id)
            ON CONFLICT (dedupe) DO NOTHING;
            IF FOUND THEN
                PERFORM public._notify(r.buyer_id, 'delivery_late', NULL, r.order_id,
                    jsonb_build_object('title', 'Seu pedido está demorando', 'text', split_part(r.driver, ' ', 1) || ' saiu da ' || r.store_name
                        || ' há mais de ' || ceil(v_late_min)::int || ' min. Fale com ele pelo pedido; se não chegar, conteste a entrega.',
                        'path', '/atividade?aba=pedidos', 'store', r.store_name), 'r:' || r.id || ':late');
                PERFORM public._notify(r.owner_id, 'delivery_late', NULL, r.order_id,
                    jsonb_build_object('title', 'Entrega atrasada', 'text', 'O pedido de ' || r.buyer || ' saiu com ' || split_part(r.driver, ' ', 1)
                        || ' há mais de ' || ceil(v_late_min)::int || ' min e ainda não foi entregue.', 'path', '/painel-loja/' || r.slug || '/pedidos', 'store', r.store_name),
                    'r:' || r.id || ':late_store');
                n_late := n_late + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('warned', n_warn, 'store_timeout', n_timeout, 'driver_idle', n_idle, 'driver_waiting', n_wait, 'transit_late', n_late);
END $$;
REVOKE ALL ON FUNCTION public.process_delivery_cycle() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('delivery-cycle-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delivery-cycle-tick');
        PERFORM cron.schedule('delivery-cycle-tick', '* * * * *', 'select public.process_delivery_cycle()');
    END IF;
END $$;
