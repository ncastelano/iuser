-- MOTORISTAS FAVORITOS DA LOJA: a loja convida motoristas iUser e, ao chamar uma entrega, eles recebem a oferta PRIMEIRO (janela de exclusividade).
--   store_favorite_drivers  : convite (invited) -> aceito (accepted) ou recusado (declined); até 10 por loja; o motorista aceita, recusa ou sai quando quiser.
--   store_favorite_settings : por loja, "favoritos primeiro" (padrão ligado) e o tempo da janela (1, 2, 3 ou 5 min; padrão 2).
--   ride_requests.exclusive_until / exclusive_released_at : enquanto exclusive_until > now() SÓ os favoritos aceitos enxergam e podem aceitar a entrega
--     (ride_offers_select + guard_ride_applications_insert, no banco). A janela só abre se há um favorito DISPONÍVEL (online, posição de até 10 min, no raio, com espaço
--     na mochila); sem nenhum, a oferta já nasce aberta para todos. Terminada a janela, o cron avisa (push) os demais motoristas do raio.
--   Só o fluxo atual (V1) usa isso; o V2 segue desligado.
-- Rollback: supabase/rollbacks/store_favorite_drivers_rollback.sql

-- ===== tabelas (sem acesso direto do app: tudo por função) =====
CREATE TABLE IF NOT EXISTS public.store_favorite_drivers (
    store_id     uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    driver_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status       text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'declined')),
    invited_at   timestamptz NOT NULL DEFAULT now(),
    responded_at timestamptz,
    PRIMARY KEY (store_id, driver_id)
);
CREATE INDEX IF NOT EXISTS store_favorite_drivers_driver_idx ON public.store_favorite_drivers (driver_id);
ALTER TABLE public.store_favorite_drivers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_favorite_drivers FROM anon, authenticated;
GRANT ALL ON public.store_favorite_drivers TO service_role;

CREATE TABLE IF NOT EXISTS public.store_favorite_settings (
    store_id        uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    favorites_first boolean NOT NULL DEFAULT true,
    window_seconds  integer NOT NULL DEFAULT 120 CHECK (window_seconds IN (60, 120, 180, 300))
);
ALTER TABLE public.store_favorite_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_favorite_settings FROM anon, authenticated;
GRANT ALL ON public.store_favorite_settings TO service_role;

ALTER TABLE public.ride_requests ADD COLUMN IF NOT EXISTS exclusive_until timestamptz;
ALTER TABLE public.ride_requests ADD COLUMN IF NOT EXISTS exclusive_released_at timestamptz;
CREATE INDEX IF NOT EXISTS ride_requests_exclusive_idx ON public.ride_requests (exclusive_until) WHERE exclusive_until IS NOT NULL AND exclusive_released_at IS NULL;

-- ===== avisos na ilha / lista de notificações =====
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

-- ===== fila de avisos: o fim da janela =====
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_kind_check;
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_kind_check CHECK (kind = ANY (ARRAY[
    'tick', 'price_raised', 'delivered', 'round_started', 'reajust_requested', 'reservation_notice', 'phase_change', 'estimate_recorded', 'freight_frozen',
    'driver_reserved', 'reservation_released', 'payment_declared', 'cancelled', 'incident_opened', 'obligation_created', 'admin_decision', 'reajust_decided',
    'search_ended', 'favorites_window_ended'
]));
ALTER TABLE public.order_delivery_events DROP CONSTRAINT IF EXISTS order_delivery_events_audit_processed_check;
ALTER TABLE public.order_delivery_events ADD CONSTRAINT order_delivery_events_audit_processed_check CHECK (
    (kind = ANY (ARRAY['tick', 'price_raised', 'delivered', 'round_started', 'reajust_requested', 'reservation_notice', 'favorites_window_ended'])) OR (processed_at IS NOT NULL)
);

-- ===== regras (uma fonte só) =====
CREATE OR REPLACE FUNCTION public._is_accepted_favorite(p_store uuid, p_driver uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.store_favorite_drivers WHERE store_id = p_store AND driver_id = p_driver AND status = 'accepted')
$$;
REVOKE ALL ON FUNCTION public._is_accepted_favorite(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Há algum favorito aceito DISPONÍVEL agora para essa entrega? (online, posição ao vivo de até 10 min, dentro do raio, com espaço na mochila)
CREATE OR REPLACE FUNCTION public._favorites_available(p_store uuid, p_lat double precision, p_lng double precision, p_radius numeric) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.store_favorite_drivers f
          JOIN public.driver_pricing dp ON dp.driver_id = f.driver_id
         WHERE f.store_id = p_store AND f.status = 'accepted'
           AND dp.driver_mode_active AND dp.live_location_sync
           AND dp.live_lat IS NOT NULL AND dp.live_lng IS NOT NULL AND dp.live_updated_at > now() - interval '10 minutes'
           AND (p_lat IS NULL OR p_lng IS NULL
                OR public.haversine_km(p_lat, p_lng, dp.live_lat, dp.live_lng) <= LEAST(COALESCE(p_radius, 50), COALESCE(dp.delivery_radius_km, COALESCE(p_radius, 50))))
           AND (SELECT count(*) FROM public.ride_requests r WHERE r.driver_id = f.driver_id AND r.order_id IS NOT NULL AND r.status = 'accepted')
               < COALESCE((SELECT max(v.delivery_capacity) FROM public.driver_vehicles v WHERE v.driver_id = f.driver_id), 1)
    )
$$;
REVOKE ALL ON FUNCTION public._favorites_available(uuid, double precision, double precision, numeric) FROM PUBLIC, anon, authenticated;

-- A oferta está aberta para este motorista? (fora da janela de exclusividade, ou ele é favorito aceito da loja)
CREATE OR REPLACE FUNCTION public._offer_open_to(p_ride uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM public.ride_requests r
         WHERE r.id = p_ride AND r.exclusive_until IS NOT NULL AND r.exclusive_until > now()
           AND NOT public._is_accepted_favorite(r.store_id, p_user)
    )
$$;
REVOKE ALL ON FUNCTION public._offer_open_to(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._offer_open_to(uuid, uuid) TO authenticated;

-- Calcula (e grava) a exclusividade de uma entrega: 'favorites' = abre a janela se houver favorito disponível; 'all' = aberta para todos
CREATE OR REPLACE FUNCTION public._exclusive_until_for(p_store uuid, p_lat double precision, p_lng double precision, p_radius numeric, p_mode text) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_first boolean; v_win integer;
BEGIN
    IF p_mode = 'all' THEN RETURN NULL; END IF;
    SELECT favorites_first, window_seconds INTO v_first, v_win FROM public.store_favorite_settings WHERE store_id = p_store;
    v_first := COALESCE(v_first, true); v_win := COALESCE(v_win, 120);
    IF p_mode IS DISTINCT FROM 'favorites' AND NOT v_first THEN RETURN NULL; END IF;
    IF NOT public._favorites_available(p_store, p_lat, p_lng, p_radius) THEN RETURN NULL; END IF;
    RETURN now() + make_interval(secs => v_win);
END; $$;
REVOKE ALL ON FUNCTION public._exclusive_until_for(uuid, double precision, double precision, numeric, text) FROM PUBLIC, anon, authenticated;

-- A entrega de loja já nasce com a janela (se a loja usa "favoritos primeiro" e há favorito disponível)
CREATE OR REPLACE FUNCTION public.set_ride_exclusivity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.order_id IS NULL OR NEW.store_id IS NULL THEN RETURN NEW; END IF;
    NEW.exclusive_until := public._exclusive_until_for(NEW.store_id, NEW.origin_lat, NEW.origin_lng, NEW.visible_radius_km, NULL);
    NEW.exclusive_released_at := NULL;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_requests_set_exclusivity ON public.ride_requests;
CREATE TRIGGER ride_requests_set_exclusivity BEFORE INSERT ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION public.set_ride_exclusivity();

-- Escolha por pedido (chamada manual: "Favoritos primeiro" / "Todos"). Só o servidor (a rota confere que a pessoa é a dona da loja).
CREATE OR REPLACE FUNCTION public.set_delivery_exclusivity(p_order uuid, p_mode text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ride_requests; v_until timestamptz;
BEGIN
    IF p_mode NOT IN ('favorites', 'all') THEN RAISE EXCEPTION 'Modo inválido' USING ERRCODE = '22023'; END IF;
    SELECT * INTO r FROM public.ride_requests WHERE order_id = p_order AND status <> 'cancelled' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND OR r.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_pending'); END IF;
    v_until := public._exclusive_until_for(r.store_id, r.origin_lat, r.origin_lng, r.visible_radius_km, p_mode);
    UPDATE public.ride_requests SET exclusive_until = v_until, exclusive_released_at = NULL WHERE id = r.id;
    RETURN jsonb_build_object('ok', true, 'exclusive_until', v_until, 'favorites_available', v_until IS NOT NULL);
END; $$;
REVOKE ALL ON FUNCTION public.set_delivery_exclusivity(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_delivery_exclusivity(uuid, text) TO service_role;

-- ===== o banco impõe a exclusividade: quem não é favorito não vê a oferta nem se candidata durante a janela =====
DROP POLICY IF EXISTS ride_offers_select ON public.ride_offers;
CREATE POLICY ride_offers_select ON public.ride_offers FOR SELECT TO authenticated
    USING (NOT EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.id = ride_offers.id AND r.requester_id = auth.uid())
           AND public._offer_open_to(ride_offers.id, auth.uid()));

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

-- Fim da janela: marca a oferta como aberta e põe na fila o aviso aos demais motoristas (a rota /api/internal/delivery-events manda o push)
CREATE OR REPLACE FUNCTION public.process_favorite_windows() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_dispatch uuid; v_count integer := 0;
BEGIN
    FOR r IN
        SELECT id, status FROM public.ride_requests
         WHERE exclusive_until IS NOT NULL AND exclusive_until <= now() AND exclusive_released_at IS NULL
         FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE public.ride_requests SET exclusive_released_at = now() WHERE id = r.id;
        IF r.status = 'pending' THEN
            SELECT id INTO v_dispatch FROM public.order_delivery_dispatches WHERE ride_request_id = r.id AND status = 'searching';
            IF v_dispatch IS NOT NULL THEN
                INSERT INTO public.order_delivery_events (dispatch_id, kind) VALUES (v_dispatch, 'favorites_window_ended');
                v_count := v_count + 1;
            END IF;
        END IF;
    END LOOP;
    IF v_count > 0 THEN PERFORM public._ping_delivery_events(); END IF;
    RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.process_favorite_windows() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_favorite_windows() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'favorite-windows-tick';
SELECT cron.schedule('favorite-windows-tick', '* * * * *', $job$SELECT public.process_favorite_windows()$job$);

-- ===== funções do app =====
-- Convidar (a loja): até 10 entre convidados e aceitos; quem recusou só pode ser convidado de novo depois de 24 h
CREATE OR REPLACE FUNCTION public.store_add_favorite_driver(p_store uuid, p_driver uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); s public.stores; f public.store_favorite_drivers; v_n integer;
BEGIN
    SELECT * INTO s FROM public.stores WHERE id = p_store;
    IF NOT FOUND OR s.owner_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF p_driver = uid THEN RAISE EXCEPTION 'Você não pode se convidar' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.driver_pricing WHERE driver_id = p_driver) AND NOT EXISTS (SELECT 1 FROM public.driver_vehicles WHERE driver_id = p_driver) THEN
        RAISE EXCEPTION 'Essa pessoa ainda não é motorista do iUser' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO f FROM public.store_favorite_drivers WHERE store_id = p_store AND driver_id = p_driver FOR UPDATE;
    IF FOUND AND f.status = 'accepted' THEN RETURN 'already'; END IF;
    IF FOUND AND f.status = 'invited' THEN RETURN 'invited'; END IF;
    IF FOUND AND f.status = 'declined' AND f.responded_at > now() - interval '24 hours' THEN RAISE EXCEPTION 'Esse motorista recusou há pouco; tente de novo amanhã' USING ERRCODE = '22023'; END IF;
    SELECT count(*) INTO v_n FROM public.store_favorite_drivers WHERE store_id = p_store AND status IN ('invited', 'accepted');
    IF v_n >= 10 THEN RAISE EXCEPTION 'Você já tem 10 motoristas entre convidados e favoritos' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.store_favorite_drivers (store_id, driver_id, status, invited_at, responded_at) VALUES (p_store, p_driver, 'invited', now(), NULL)
    ON CONFLICT (store_id, driver_id) DO UPDATE SET status = 'invited', invited_at = now(), responded_at = NULL;
    PERFORM public._notify(p_driver, 'favorite_invite', uid, p_store,
        jsonb_build_object('title', 'Convite de loja', 'text', s.name || ' quer você entre os entregadores favoritos', 'path', '/entregas', 'store_id', p_store),
        'favinv:' || p_store || ':' || p_driver || ':' || to_char(now(), 'YYYYMMDDHH24'));
    RETURN 'invited';
END; $$;

CREATE OR REPLACE FUNCTION public.store_remove_favorite_driver(p_store uuid, p_driver uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    DELETE FROM public.store_favorite_drivers WHERE store_id = p_store AND driver_id = p_driver;
END; $$;

-- O motorista responde ao convite
CREATE OR REPLACE FUNCTION public.respond_favorite_invite(p_store uuid, p_accept boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); s public.stores; me record;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Entre para responder' USING ERRCODE = '42501'; END IF;
    UPDATE public.store_favorite_drivers SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END, responded_at = now()
     WHERE store_id = p_store AND driver_id = uid AND status = 'invited';
    IF NOT FOUND THEN RAISE EXCEPTION 'Convite não encontrado' USING ERRCODE = '22023'; END IF;
    SELECT * INTO s FROM public.stores WHERE id = p_store;
    SELECT "profileSlug" AS slug, name INTO me FROM public.profiles WHERE id = uid;
    PERFORM public._notify(s.owner_id, CASE WHEN p_accept THEN 'favorite_accepted' ELSE 'favorite_declined' END, uid, p_store,
        jsonb_build_object('title', CASE WHEN p_accept THEN 'Novo entregador favorito' ELSE 'Convite recusado' END,
                           'text', COALESCE('@' || me.slug, me.name, 'O motorista') || CASE WHEN p_accept THEN ' agora é seu entregador favorito' ELSE ' recusou ser seu entregador favorito' END,
                           'path', '/painel-loja/' || s."storeSlug"),
        'favresp:' || p_store || ':' || uid || ':' || to_char(now(), 'YYYYMMDDHH24MISS'));
END; $$;

-- O motorista sai da lista de uma loja
CREATE OR REPLACE FUNCTION public.leave_favorite(p_store uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); s public.stores; me record;
BEGIN
    DELETE FROM public.store_favorite_drivers WHERE store_id = p_store AND driver_id = uid AND status = 'accepted';
    IF NOT FOUND THEN RETURN; END IF;
    SELECT * INTO s FROM public.stores WHERE id = p_store;
    SELECT "profileSlug" AS slug, name INTO me FROM public.profiles WHERE id = uid;
    PERFORM public._notify(s.owner_id, 'favorite_declined', uid, p_store,
        jsonb_build_object('title', 'Entregador saiu dos favoritos', 'text', COALESCE('@' || me.slug, me.name, 'Um motorista') || ' saiu dos seus entregadores favoritos', 'path', '/painel-loja/' || s."storeSlug"),
        'favleave:' || p_store || ':' || uid || ':' || to_char(now(), 'YYYYMMDDHH24MISS'));
END; $$;

-- Painel da loja: lista de convidados/favoritos + ajustes
CREATE OR REPLACE FUNCTION public.get_store_favorites(p_store uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_items jsonb; v_set record;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.status, x.invited_at), '[]'::jsonb) INTO v_items FROM (
        SELECT f.driver_id, p.name, p."profileSlug" AS slug, p.avatar_url AS photo, f.status, f.invited_at,
               (dp.driver_mode_active AND dp.live_location_sync AND dp.live_updated_at > now() - interval '10 minutes') AS online,
               (SELECT count(*) FROM public.ride_requests r WHERE r.driver_id = f.driver_id AND r.store_id = p_store AND r.status = 'completed') AS deliveries,
               (SELECT rating_avg FROM public.get_driver_public_stats(f.driver_id)) AS rating_avg,
               (SELECT rating_count FROM public.get_driver_public_stats(f.driver_id)) AS rating_count
          FROM public.store_favorite_drivers f
          JOIN public.profiles p ON p.id = f.driver_id
          LEFT JOIN public.driver_pricing dp ON dp.driver_id = f.driver_id
         WHERE f.store_id = p_store AND f.status IN ('invited', 'accepted')) x;
    SELECT COALESCE(s.favorites_first, true) AS favorites_first, COALESCE(s.window_seconds, 120) AS window_seconds INTO v_set
      FROM (SELECT 1) d LEFT JOIN public.store_favorite_settings s ON s.store_id = p_store;
    RETURN jsonb_build_object('items', v_items, 'favorites_first', v_set.favorites_first, 'window_seconds', v_set.window_seconds);
END; $$;

-- Sugestões/busca para convidar: sem texto = quem já entregou para a loja (mais entregas primeiro); com texto = motoristas por nome ou @
CREATE OR REPLACE FUNCTION public.suggest_favorite_drivers(p_store uuid, p_q text DEFAULT NULL)
RETURNS TABLE (driver_id uuid, name text, slug text, photo text, deliveries bigint, rating_avg numeric, rating_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q text := NULLIF(btrim(COALESCE(p_q, '')), '');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF v_q IS NOT NULL THEN v_q := replace(replace(replace(v_q, '\', ''), '%', ''), '_', ''); END IF;
    RETURN QUERY
    SELECT p.id, p.name, p."profileSlug", p.avatar_url,
           (SELECT count(*) FROM public.ride_requests r WHERE r.driver_id = p.id AND r.store_id = p_store AND r.status = 'completed'),
           (SELECT st.rating_avg FROM public.get_driver_public_stats(p.id) st),
           (SELECT st.rating_count FROM public.get_driver_public_stats(p.id) st)
      FROM public.profiles p
     WHERE p.id <> auth.uid()
       AND COALESCE(p.is_active, true)
       AND NOT EXISTS (SELECT 1 FROM public.store_favorite_drivers f WHERE f.store_id = p_store AND f.driver_id = p.id AND f.status IN ('invited', 'accepted'))
       AND (EXISTS (SELECT 1 FROM public.driver_pricing d WHERE d.driver_id = p.id) OR EXISTS (SELECT 1 FROM public.driver_vehicles v WHERE v.driver_id = p.id))
       AND CASE WHEN v_q IS NULL THEN EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.driver_id = p.id AND r.store_id = p_store AND r.status = 'completed')
                ELSE (p.name ILIKE '%' || v_q || '%' OR p."profileSlug" ILIKE '%' || replace(v_q, '@', '') || '%') END
     ORDER BY 5 DESC, p.name
     LIMIT 8;
END; $$;

CREATE OR REPLACE FUNCTION public.set_store_favorites_settings(p_store uuid, p_first boolean, p_window integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF p_window NOT IN (60, 120, 180, 300) THEN RAISE EXCEPTION 'Tempo inválido (1, 2, 3 ou 5 minutos)' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.store_favorite_settings (store_id, favorites_first, window_seconds) VALUES (p_store, p_first, p_window)
    ON CONFLICT (store_id) DO UPDATE SET favorites_first = EXCLUDED.favorites_first, window_seconds = EXCLUDED.window_seconds;
END; $$;

-- Central do motorista: convites e lojas de que ele é favorito
CREATE OR REPLACE FUNCTION public.get_my_favorite_stores()
RETURNS TABLE (store_id uuid, store_name text, store_slug text, logo_url text, status text, invited_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT s.id, s.name, s."storeSlug", s.logo_url, f.status, f.invited_at
      FROM public.store_favorite_drivers f JOIN public.stores s ON s.id = f.store_id
     WHERE f.driver_id = auth.uid() AND f.status IN ('invited', 'accepted')
     ORDER BY (f.status = 'invited') DESC, f.invited_at DESC
$$;

-- Entregas que estão, agora, em janela exclusiva PARA mim (selo "Favorita da loja" + contagem)
CREATE OR REPLACE FUNCTION public.get_my_exclusive_offers()
RETURNS TABLE (ride_id uuid, exclusive_until timestamptz, store_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT r.id, r.exclusive_until, s.name
      FROM public.ride_requests r JOIN public.stores s ON s.id = r.store_id
     WHERE r.status = 'pending' AND r.exclusive_until > now() AND public._is_accepted_favorite(r.store_id, auth.uid())
$$;

DO $$ DECLARE f text; BEGIN
    FOREACH f IN ARRAY ARRAY['store_add_favorite_driver(uuid,uuid)', 'store_remove_favorite_driver(uuid,uuid)', 'respond_favorite_invite(uuid,boolean)', 'leave_favorite(uuid)',
                             'get_store_favorites(uuid)', 'suggest_favorite_drivers(uuid,text)', 'set_store_favorites_settings(uuid,boolean,integer)', 'get_my_favorite_stores()', 'get_my_exclusive_offers()']
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
    END LOOP;
END $$;
