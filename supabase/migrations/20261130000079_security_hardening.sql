-- 20261130000079_security_hardening.sql
--
-- REVISÃO DE SEGURANÇA ANTES DE COMERCIALIZAR (18/11/2026): funções que qualquer visitante (anon) conseguia chamar e que
-- escreviam no banco sem conferir quem chamava. Nenhuma devolvia dado privado; o risco era FRAUDE / VANDALISMO:
--   1. _grant_hierarchy_borders / _grant_prepaid_borders: qualquer pessoa liberava para si (ou para outra) as molduras
--      que são PRÊMIO de nível ou do Pré-pago.  _wait_auto_end: encerrava a espera de qualquer corrida.
--      _community_close_rounds: fechava as rodadas de foto de qualquer comunidade.
--      → são funções INTERNAS (só outras funções do banco e o pg_cron as chamam): sai o EXECUTE do app.
--   2. consume_campaign_code: qualquer visitante "queimava" os códigos do Club VIP de qualquer loja (o cliente chegava
--      com o código e ele já estava usado). O app nunca chama: quem consome é o próprio banco ao fechar o pedido.
--      record_store_visit: ninguém no app chama (as visitas da loja têm outro caminho) → sai do app também.
--   3. Contadores que alimentam o OUTDOOR (ranking por pontos) não tinham limite: um script somava milhares de
--      visualizações/compartilhamentos e subia qualquer loja/produto no ranking. Agora:
--        - logado: conta 1 vez por pessoa, por item, por dia (visualização e compartilhamento);
--        - visitante sem conta: visualização conta até 30 por item por hora (soma de TODOS os visitantes);
--          compartilhamento de visitante não conta (a pessoa logada conta).
--   4. record_profile_visit aceitava o "quem visitou" vindo do app (p_viewer_id): dava para aparecer na lista de
--      visitantes de alguém como OUTRA pessoa. Agora quem visitou é sempre o login (auth.uid()); sem login = anônimo.
--      Mesma pessoa conta 1 vez a cada 10 min; anônimos até 30 por perfil por hora. Textos (referrer/UA) cortados.
--   5. Telemetria (track_usage / track_service_usage): valores limitados por chamada e, do navegador, só o Mapbox
--      com as métricas conhecidas (antes dava para encher o painel do Admin com números falsos).
-- Rollback: supabase/rollbacks/security_hardening_rollback.sql. Cenários: supabase/tests/security_hardening_scenarios.sql.

-- ── 1 e 2. funções internas: só o banco chama ─────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public._grant_hierarchy_borders(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._grant_prepaid_borders(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._wait_auto_end(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._community_close_rounds(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_campaign_code(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_store_visit(uuid, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._grant_hierarchy_borders(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._grant_prepaid_borders(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._wait_auto_end(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._community_close_rounds(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_campaign_code(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_store_visit(uuid, text, uuid, text, text, text, text) TO service_role;

-- ── 3. limite dos contadores ──────────────────────────────────────────────────────────────────────────────────────
-- quem já contou hoje (logado)
CREATE TABLE IF NOT EXISTS public.counter_hits (
    kind    text NOT NULL,
    item_id uuid NOT NULL,
    actor   uuid NOT NULL,
    day     date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Porto_Velho')::date,
    PRIMARY KEY (kind, item_id, actor, day)
);
-- quantos anônimos contaram nesta hora (por item)
CREATE TABLE IF NOT EXISTS public.counter_anon_buckets (
    kind    text NOT NULL,
    item_id uuid NOT NULL,
    hour    timestamptz NOT NULL,
    n       int NOT NULL DEFAULT 0,
    PRIMARY KEY (kind, item_id, hour)
);
ALTER TABLE public.counter_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counter_anon_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.counter_hits, public.counter_anon_buckets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.counter_anon_cap() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 30 $$;

-- TRUE = pode somar mais 1. Logado: 1 vez por pessoa/item/dia. Anônimo: até counter_anon_cap() por item por hora
-- (p_anon_ok = false: anônimo nunca conta).
CREATE OR REPLACE FUNCTION public._counter_allow(p_kind text, p_item uuid, p_anon_ok boolean DEFAULT true) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_n int;
BEGIN
    IF p_item IS NULL THEN RETURN false; END IF;
    IF v_uid IS NOT NULL THEN
        INSERT INTO public.counter_hits (kind, item_id, actor) VALUES (p_kind, p_item, v_uid) ON CONFLICT DO NOTHING;
        RETURN FOUND;
    END IF;
    IF NOT p_anon_ok THEN RETURN false; END IF;
    INSERT INTO public.counter_anon_buckets (kind, item_id, hour, n) VALUES (p_kind, p_item, date_trunc('hour', now()), 1)
    ON CONFLICT (kind, item_id, hour) DO UPDATE SET n = counter_anon_buckets.n + 1
    WHERE counter_anon_buckets.n < public.counter_anon_cap()
    RETURNING n INTO v_n;
    RETURN v_n IS NOT NULL;
END; $$;
REVOKE ALL ON FUNCTION public._counter_allow(text, uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_product_view_count(p_product_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int;
BEGIN
    IF public._counter_allow('product_view', p_product_id) THEN
        UPDATE public.products SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_product_id RETURNING view_count INTO v;
    ELSE
        SELECT view_count INTO v FROM public.products WHERE id = p_product_id;
    END IF;
    RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.increment_service_request_view_count(p_request_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int;
BEGIN
    IF public._counter_allow('service_request_view', p_request_id) THEN
        UPDATE public.service_requests SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_request_id RETURNING view_count INTO v;
    ELSE
        SELECT view_count INTO v FROM public.service_requests WHERE id = p_request_id;
    END IF;
    RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.increment_product_share_count(p_product uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int;
BEGIN
    IF public._counter_allow('product_share', p_product, false) THEN
        UPDATE public.products SET share_count = COALESCE(share_count, 0) + 1 WHERE id = p_product RETURNING share_count INTO v;
    ELSE
        SELECT share_count INTO v FROM public.products WHERE id = p_product;
    END IF;
    RETURN v;
END; $$;

REVOKE EXECUTE ON FUNCTION public.increment_product_view_count(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_service_request_view_count(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_product_share_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_product_view_count(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_service_request_view_count(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_product_share_count(uuid) TO anon, authenticated, service_role;

-- ── 4. visita ao perfil: quem visitou = o login ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_profile_visit(p_profile_id uuid, p_session_id text, p_viewer_id uuid DEFAULT NULL::uuid,
    p_anonymous_id text DEFAULT NULL::text, p_device_type text DEFAULT 'desktop'::text, p_referrer text DEFAULT NULL::text,
    p_user_agent text DEFAULT NULL::text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();           -- p_viewer_id é IGNORADO (vinha do app e podia ser de outra pessoa)
    v_anon text := CASE WHEN auth.uid() IS NULL THEN left(NULLIF(trim(p_anonymous_id), ''), 64) END;
    v_n int;
BEGIN
    IF p_profile_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN RETURN false; END IF;
    IF v_uid IS NOT NULL AND v_uid = p_profile_id THEN RETURN false; END IF;      -- a própria pessoa não conta
    IF v_uid IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.profile_visits WHERE profile_id = p_profile_id AND viewer_id = v_uid
                   AND created_at > now() - interval '10 minutes') THEN RETURN false; END IF;
    ELSE
        IF v_anon IS NOT NULL AND EXISTS (SELECT 1 FROM public.profile_visits WHERE profile_id = p_profile_id AND anonymous_id = v_anon
                   AND created_at > now() - interval '10 minutes') THEN RETURN false; END IF;
        -- teto de visitantes anônimos por perfil por hora (o anonymous_id é escolhido pelo app e pode ser trocado à vontade)
        INSERT INTO public.counter_anon_buckets (kind, item_id, hour, n) VALUES ('profile_visit', p_profile_id, date_trunc('hour', now()), 1)
        ON CONFLICT (kind, item_id, hour) DO UPDATE SET n = counter_anon_buckets.n + 1
        WHERE counter_anon_buckets.n < public.counter_anon_cap()
        RETURNING n INTO v_n;
        IF v_n IS NULL THEN RETURN false; END IF;
    END IF;

    INSERT INTO public.profile_visits (profile_id, viewer_id, anonymous_id, session_id, device_type, referrer, user_agent)
    VALUES (p_profile_id, v_uid, v_anon, left(p_session_id, 64),
            CASE WHEN p_device_type IN ('mobile', 'tablet', 'desktop') THEN p_device_type ELSE 'desktop' END,
            left(p_referrer, 300), left(p_user_agent, 300));
    UPDATE public.profiles SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_profile_id;
    RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION public.record_profile_visit(uuid, text, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_profile_visit(uuid, text, uuid, text, text, text, text) TO anon, authenticated, service_role;

-- ── 5. telemetria com limite ──────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.track_usage(p_egress_bytes bigint DEFAULT 0, p_realtime_messages bigint DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    -- o app manda a cada 20 s; 200 MB e 50 mil mensagens por envio já é muito mais do que um navegador gasta
    v_e bigint := LEAST(GREATEST(COALESCE(p_egress_bytes, 0), 0), 200000000);
    v_m bigint := LEAST(GREATEST(COALESCE(p_realtime_messages, 0), 0), 50000);
BEGIN
    IF v_e = 0 AND v_m = 0 THEN RETURN; END IF;
    INSERT INTO public.usage_telemetry_daily (day, egress_bytes, realtime_messages) VALUES (current_date, v_e, v_m)
    ON CONFLICT (day) DO UPDATE SET egress_bytes = usage_telemetry_daily.egress_bytes + excluded.egress_bytes,
        realtime_messages = usage_telemetry_daily.realtime_messages + excluded.realtime_messages, updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.track_service_usage(p_service text, p_metric text, p_count integer DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- quem chama: o papel do LOGIN (auth.role()); sem JWT = SQL direto/cron. Nunca current_user: dentro de SECURITY DEFINER ele é o dono.
DECLARE v_server boolean := COALESCE(auth.role(), 'service_role') = 'service_role';
        v_count int := GREATEST(COALESCE(p_count, 1), 0);
BEGIN
    IF p_service IS NULL OR p_metric IS NULL OR length(p_service) > 40 OR length(p_metric) > 40 THEN RETURN; END IF;
    IF NOT v_server THEN
        -- do navegador só vem o Mapbox (lib/mapboxTelemetry.ts), 1 chamada por vez
        IF p_service <> 'mapbox' OR p_metric NOT IN ('directions', 'optimization', 'geocoding', 'searchbox', 'matrix') THEN RETURN; END IF;
        v_count := LEAST(v_count, 1);
    ELSE
        v_count := LEAST(v_count, 100000);
    END IF;
    IF v_count = 0 THEN RETURN; END IF;
    INSERT INTO public.service_usage_telemetry_daily (day, service, metric, count, updated_at)
    VALUES (current_date, p_service, p_metric, v_count, now())
    ON CONFLICT (day, service, metric) DO UPDATE SET count = service_usage_telemetry_daily.count + v_count, updated_at = now();
END; $$;

-- ── limpeza diária das marcas dos contadores ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.counter_hits_purge() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    DELETE FROM public.counter_hits WHERE day < (now() AT TIME ZONE 'America/Porto_Velho')::date - 2;
    DELETE FROM public.counter_anon_buckets WHERE hour < now() - interval '1 day';
$$;
REVOKE ALL ON FUNCTION public.counter_hits_purge() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'counter-hits-purge';
        PERFORM cron.schedule('counter-hits-purge', '27 3 * * *', 'select public.counter_hits_purge()');
    END IF;
END $$;
