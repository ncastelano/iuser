-- MISSÕES DA LOJA (pontuação diária) LIGADAS AO OUTDOOR DE LOJAS.
--
--  • Duas famílias de missão, TODAS conferidas pelo banco (o app nunca diz "cumpri"):
--      'once'  = CADASTRO da loja (logo, descrição, horário, agenda, 1º produto, Pix, entrega). Vale ENQUANTO está feito: se a loja tira
--                o Pix, perde os pontos (conta ao vivo, não fica no livro).
--      'daily' = MISSÕES DO DIA (responder um pedido, responder uma conversa, publicar, cadastrar novidade, conferir um repasse).
--                Quando cumpridas, o prêmio é GRAVADO no livro (`store_mission_awards`, uma linha por loja+missão+dia, pontos congelados).
--  • Ligação com o Outdoor: um sinal novo, `missions` em `outdoor_rules` (kind 'lojas'), com o número = cadastro feito agora + prêmios
--    dos últimos 30 dias. O peso (padrão 0,5) e o teto de unidades (400 → no máximo 200 pontos) são editáveis em Admin → Pontuação,
--    como os demais sinais. `rolls_up` = false: missão não soma no total do DONO (placar do perfil), só na loja.
--  • Fuso das missões do dia: America/Porto_Velho (o "hoje" da loja, não o do servidor).
--  • Não existe "abrir a loja hoje" nem "responder avaliação": o horário da loja é uma agenda (não uma ação) e a avaliação não tem resposta.
-- Tudo só por função/servidor (tabelas sem acesso do app). Rollback: supabase/rollbacks/store_missions_rollback.sql

-- ===== 1. Catálogo =====
CREATE TABLE IF NOT EXISTS public.store_missions (
    code       text PRIMARY KEY CHECK (code ~ '^[a-z0-9_]{3,30}$'),
    kind       text NOT NULL CHECK (kind IN ('once', 'daily')),
    title      text NOT NULL,
    hint       text,
    points     integer NOT NULL CHECK (points BETWEEN 0 AND 100),
    scope      text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'products', 'services', 'delivery')),   -- a que modelo de loja se aplica
    dest       text,                       -- onde a loja resolve (chave de destino da tela: dados, horarios, agenda, catalogo, pagamento, entrega, publicacao...)
    is_active  boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0
);
ALTER TABLE public.store_missions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_missions FROM anon, authenticated;

INSERT INTO public.store_missions (code, kind, title, hint, points, scope, dest, sort_order) VALUES
    ('logo',       'once',  'Logo da loja',                   'Envie a foto que aparece na página e nas listas',               10, 'all',      'dados',      1),
    ('desc',       'once',  'Descrição da loja',              'Conte em poucas linhas o que a loja faz (20 letras ou mais)',    5, 'all',      'dados',      2),
    ('hor',        'once',  'Horário de funcionamento',       'Diga em que dias e horas a loja abre',                          10, 'all',      'horarios',   3),
    ('age',        'once',  'Agenda de horários',             'Ligue o agendamento para os clientes marcarem serviços',        10, 'services', 'agenda',     4),
    ('prim',       'once',  'Primeiro produto ou serviço',    'Cadastre ao menos um item ativo no catálogo',                   15, 'all',      'catalogo',   5),
    ('pix',        'once',  'Chave Pix',                      'Sem ela a loja não recebe entrada, apoio nem repasse',          10, 'all',      'pagamento',  6),
    ('ent',        'once',  'Como a entrega funciona',        'Escolha entrega em casa, retirada ou as duas',                  10, 'products', 'entrega',    7),
    ('pedido',     'daily', 'Responder um pedido',            'Aceite, recuse ou conclua ao menos um pedido hoje',              5, 'products', NULL,         10),
    ('conversa',   'daily', 'Responder uma conversa',         'Mande uma mensagem para um cliente hoje',                        3, 'all',      NULL,         11),
    ('publicacao', 'daily', 'Fazer uma publicação',           'Publique uma novidade da loja hoje',                             5, 'all',      'publicacao', 12),
    ('novidade',   'daily', 'Cadastrar uma novidade',         'Cadastre um produto ou serviço novo hoje',                       3, 'all',      'catalogo',   13),
    ('repasse',    'daily', 'Conferir um repasse',            'Confirme ou conteste um repasse de entrega hoje',                2, 'delivery', NULL,         14)
ON CONFLICT (code) DO NOTHING;

-- ===== 2. Prêmios do dia (livro-caixa: uma linha por loja + missão + dia, pontos congelados) =====
CREATE TABLE IF NOT EXISTS public.store_mission_awards (
    store_id     uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    mission_code text NOT NULL REFERENCES public.store_missions(code) ON DELETE CASCADE,
    day          date NOT NULL,
    points       integer NOT NULL,
    awarded_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (store_id, mission_code, day)
);
CREATE INDEX IF NOT EXISTS store_mission_awards_day_idx ON public.store_mission_awards (store_id, day DESC);
ALTER TABLE public.store_mission_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_mission_awards FROM anon, authenticated;

-- ===== 3. O "hoje" da loja e o que cada missão confere =====
CREATE OR REPLACE FUNCTION public._mission_day() RETURNS date LANGUAGE sql STABLE AS $$
    SELECT (now() AT TIME ZONE 'America/Porto_Velho')::date
$$;

-- Estado de cada missão ativa de cada loja ativa (ou de UMA loja). `applies` = vale para o modelo da loja (produtos/serviços/os dois);
-- `done` = o banco confere que está cumprida (cadastro: agora; do dia: hoje).
CREATE OR REPLACE FUNCTION public._store_mission_status(p_store uuid DEFAULT NULL)
RETURNS TABLE(store_id uuid, code text, kind text, title text, hint text, points integer, dest text, sort_order integer, applies boolean, done boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH d AS (SELECT public._mission_day() AS today)
    SELECT s.id, m.code, m.kind, m.title, m.hint, m.points, m.dest, m.sort_order,
           (m.scope = 'all'
            OR (m.scope = 'products' AND s.store_model <> 'services')
            OR (m.scope = 'services' AND s.store_model <> 'products')
            OR (m.scope = 'delivery' AND s.store_model <> 'services')),
           COALESCE(CASE m.code
               WHEN 'logo' THEN btrim(COALESCE(s.logo_url, '')) <> ''
               WHEN 'desc' THEN length(btrim(COALESCE(s.description, ''))) >= 20
               WHEN 'hor'  THEN CASE WHEN jsonb_typeof(s.business_hours::jsonb -> 'weekly') = 'object'
                                     THEN EXISTS (SELECT 1 FROM jsonb_each(s.business_hours::jsonb -> 'weekly') w WHERE w.value ->> 'isOpen' = 'true')
                                     ELSE false END
               WHEN 'age'  THEN COALESCE(s.allow_scheduling, false)
               WHEN 'prim' THEN EXISTS (SELECT 1 FROM public.products p WHERE p.store_id = s.id AND p.is_active AND p.listing_type = 'sale')
               WHEN 'pix'  THEN btrim(COALESCE(s.pix_key, '')) <> ''
               WHEN 'ent'  THEN COALESCE(s.accepts_delivery, false) OR COALESCE(s.accepts_pickup, false) OR COALESCE(s.iuser_delivery_enabled, false)
               WHEN 'pedido' THEN EXISTS (SELECT 1 FROM public.orders o
                                           WHERE o.store_id = s.id AND o.store_visible AND o.status <> 'pending'
                                             AND (o.updated_at AT TIME ZONE 'America/Porto_Velho')::date = d.today)
               WHEN 'conversa' THEN EXISTS (SELECT 1 FROM public.conversations c JOIN public.direct_messages dm ON dm.conversation_id = c.id
                                             WHERE c.store_id = s.id AND dm.sender_id <> c.customer_id
                                               AND (dm.created_at AT TIME ZONE 'America/Porto_Velho')::date = d.today)
               WHEN 'publicacao' THEN EXISTS (SELECT 1 FROM public.products p
                                               WHERE p.store_id = s.id AND p.listing_type = 'publication'
                                                 AND (p.created_at AT TIME ZONE 'America/Porto_Velho')::date = d.today)
               WHEN 'novidade' THEN EXISTS (SELECT 1 FROM public.products p
                                             WHERE p.store_id = s.id AND p.listing_type = 'sale'
                                               AND (p.created_at AT TIME ZONE 'America/Porto_Velho')::date = d.today)
               WHEN 'repasse' THEN EXISTS (SELECT 1 FROM public.store_dues sd
                                            WHERE sd.store_id = s.id AND sd.confirmed_at IS NOT NULL
                                              AND (sd.confirmed_at AT TIME ZONE 'America/Porto_Velho')::date = d.today)
               ELSE false END, false)
      FROM public.stores s
      CROSS JOIN d
      JOIN public.store_missions m ON m.is_active
     WHERE s.is_active AND (p_store IS NULL OR s.id = p_store)
$$;
REVOKE ALL ON FUNCTION public._store_mission_status(uuid) FROM public, anon, authenticated;

-- Grava os prêmios do dia (idempotente) e, na rodada geral, apaga prêmios com mais de 120 dias.
CREATE OR REPLACE FUNCTION public.evaluate_store_missions(p_store uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
    INSERT INTO public.store_mission_awards (store_id, mission_code, day, points)
    SELECT st.store_id, st.code, public._mission_day(), st.points
      FROM public._store_mission_status(p_store) st
     WHERE st.kind = 'daily' AND st.applies AND st.done AND st.points > 0
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF p_store IS NULL THEN
        DELETE FROM public.store_mission_awards WHERE day < public._mission_day() - 120;
    END IF;
    RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.evaluate_store_missions(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_store_missions(uuid) TO service_role;

-- Número que o Outdoor usa: cadastro feito AGORA + prêmios do dia dos últimos 30 dias.
CREATE OR REPLACE FUNCTION public._store_mission_units()
RETURNS TABLE(store_id uuid, units numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT x.store_id, sum(x.pts)::numeric
      FROM (
          SELECT st.store_id, st.points AS pts FROM public._store_mission_status() st WHERE st.kind = 'once' AND st.applies AND st.done
          UNION ALL
          SELECT a.store_id, a.points FROM public.store_mission_awards a WHERE a.day > public._mission_day() - 30
      ) x
     GROUP BY x.store_id
$$;
REVOKE ALL ON FUNCTION public._store_mission_units() FROM public, anon, authenticated;

-- ===== 4. O sinal do Outdoor (editável em Admin → Pontuação como os outros) =====
INSERT INTO public.outdoor_rules (kind, signal, label, weight, is_active, rolls_up, max_units, sort_order) VALUES
    ('lojas', 'missions', 'Ponto de missão da loja (cadastro + missões dos últimos 30 dias)', 0.5, true, false, 400, 9)
ON CONFLICT (kind, signal) DO NOTHING;

-- _outdoor_units: a mesma função da 051, com UMA linha a mais no ramo das lojas (`missions`).
CREATE OR REPLACE FUNCTION public._outdoor_units(p_kind text)
RETURNS TABLE(id uuid, owner_id uuid, signal text, units numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
    IF p_kind = 'lojas' THEN
        RETURN QUERY
        SELECT s.id, s.owner_id, v.signal, v.units::numeric
        FROM public.stores s
        JOIN public.profiles pr ON pr.id = s.owner_id AND pr.is_active AND NOT COALESCE(pr.is_blocked, false)
        LEFT JOIN (SELECT o.store_id AS sid,
                          count(*) FILTER (WHERE o.status = 'paid') AS sales,
                          count(DISTINCT o.buyer_id) FILTER (WHERE o.status = 'paid') AS customers,
                          count(*) FILTER (WHERE o.status = 'rejected') AS rejected
                     FROM public.orders o GROUP BY o.store_id) od ON od.sid = s.id
        LEFT JOIN (SELECT fl.following_id AS fid, count(*) AS n FROM public.follows fl GROUP BY fl.following_id) f ON f.fid = s.id
        LEFT JOIN (SELECT pr2.store_id AS sid, count(*) AS n FROM public.products pr2 WHERE pr2.is_active AND pr2.listing_type = 'sale' GROUP BY pr2.store_id) l ON l.sid = s.id
        LEFT JOIN public._store_mission_units() ms ON ms.store_id = s.id
        CROSS JOIN LATERAL (VALUES
            ('sales',     COALESCE(od.sales, 0)::numeric),
            ('customers', COALESCE(od.customers, 0)::numeric),
            ('stars',     COALESCE(s.ratings_avg, 0)::numeric * COALESCE(s.ratings_count, 0)),
            ('followers', COALESCE(f.n, 0)::numeric),
            ('views',     COALESCE(s.view_count, 0)::numeric),
            ('listings',  COALESCE(l.n, 0)::numeric),
            ('shares',    COALESCE(s.share_count, 0)::numeric),
            ('rejected',  COALESCE(od.rejected, 0)::numeric),
            ('missions',  COALESCE(ms.units, 0)::numeric)
        ) v(signal, units)
        WHERE s.is_active;
    ELSIF p_kind = 'servicos' THEN
        RETURN QUERY
        SELECT p.id, COALESCE(st.owner_id, p.owner_id), v.signal, v.units::numeric
        FROM public.products p
        LEFT JOIN public.stores st ON st.id = p.store_id
        LEFT JOIN (SELECT ap.service_id AS sid, count(*) AS n FROM public.appointments ap WHERE ap.completed_at IS NOT NULL AND ap.service_id IS NOT NULL GROUP BY ap.service_id) a ON a.sid = p.id
        CROSS JOIN LATERAL (VALUES
            ('views',    COALESCE(p.view_count, 0)::numeric),
            ('stars',    COALESCE(p.ratings_avg, 0)::numeric * COALESCE(p.ratings_count, 0)),
            ('bookings', COALESCE(a.n, 0)::numeric),
            ('shares',   COALESCE(p.share_count, 0)::numeric)
        ) v(signal, units)
        WHERE p.is_active AND p.type = 'service';
    ELSIF p_kind = 'produtos' THEN
        RETURN QUERY
        SELECT p.id, COALESCE(st.owner_id, p.owner_id), v.signal, v.units::numeric
        FROM public.products p
        LEFT JOIN public.stores st ON st.id = p.store_id
        LEFT JOIN (SELECT oi.product_id AS pid, sum(oi.quantity) AS n FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE o.status = 'paid' GROUP BY oi.product_id) i ON i.pid = p.id
        CROSS JOIN LATERAL (VALUES
            ('views',  COALESCE(p.view_count, 0)::numeric),
            ('stars',  COALESCE(p.ratings_avg, 0)::numeric * COALESCE(p.ratings_count, 0)),
            ('sold',   COALESCE(i.n, 0)::numeric),
            ('shares', COALESCE(p.share_count, 0)::numeric)
        ) v(signal, units)
        WHERE p.is_active AND p.type = 'physical' AND p.listing_type = 'sale';
    ELSIF p_kind = 'digitais' THEN
        RETURN QUERY
        SELECT p.id, COALESCE(st.owner_id, p.owner_id), v.signal, v.units::numeric
        FROM public.products p
        LEFT JOIN public.stores st ON st.id = p.store_id
        LEFT JOIN (SELECT oi.product_id AS pid, sum(oi.quantity) AS n FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE o.status = 'paid' GROUP BY oi.product_id) i ON i.pid = p.id
        LEFT JOIN (SELECT dc.product_id AS pid, count(*) AS n FROM public.digital_claims dc GROUP BY dc.product_id) cl ON cl.pid = p.id
        LEFT JOIN (SELECT ct.product_id AS pid, count(*) AS n FROM public.digital_downloads dd JOIN public.digital_contents ct ON ct.id = dd.item_id GROUP BY ct.product_id) dl ON dl.pid = p.id
        CROSS JOIN LATERAL (VALUES
            ('sales',     COALESCE(i.n, 0)::numeric),
            ('claims',    COALESCE(cl.n, 0)::numeric),
            ('stars',     COALESCE(p.ratings_avg, 0)::numeric * COALESCE(p.ratings_count, 0)),
            ('downloads', COALESCE(dl.n, 0)::numeric),
            ('shares',    COALESCE(p.share_count, 0)::numeric),
            ('views',     COALESCE(p.view_count, 0)::numeric)
        ) v(signal, units)
        WHERE p.is_active AND p.type = 'digital'
          AND EXISTS (SELECT 1 FROM public.digital_contents x WHERE x.product_id = p.id AND NOT COALESCE(x.is_teaser, false));
    ELSIF p_kind = 'imoveis' THEN
        RETURN QUERY
        SELECT r.id, r.owner_id, v.signal, v.units::numeric
        FROM public.rental_listings r
        LEFT JOIN (SELECT ap.rental_listing_id AS rid, count(*) AS n FROM public.appointments ap WHERE ap.completed_at IS NOT NULL AND ap.rental_listing_id IS NOT NULL GROUP BY ap.rental_listing_id) a ON a.rid = r.id
        CROSS JOIN LATERAL (VALUES
            ('listed', 1::numeric),
            ('views',  COALESCE(r.view_count, 0)::numeric),
            ('visits', COALESCE(a.n, 0)::numeric)
        ) v(signal, units)
        WHERE r.status = 'active';
    ELSIF p_kind = 'motoristas' THEN
        RETURN QUERY
        SELECT p.id, p.id, v.signal, v.units::numeric
        FROM public.profiles p
        LEFT JOIN (SELECT rr.driver_id AS did,
                          count(*) FILTER (WHERE rr.status = 'completed' AND rr.order_id IS NULL) AS rides,
                          count(*) FILTER (WHERE rr.status = 'completed' AND rr.order_id IS NOT NULL) AS deliveries,
                          count(*) FILTER (WHERE rr.status = 'cancelled' AND rr.cancelled_by = 'driver') AS cancels
                     FROM public.ride_requests rr WHERE rr.driver_id IS NOT NULL GROUP BY rr.driver_id) rd ON rd.did = p.id
        LEFT JOIN (SELECT rv.reviewee_id AS did, sum(rv.rating) AS stars
                     FROM public.ride_reviews rv JOIN public.ride_requests r2 ON r2.id = rv.ride_request_id AND r2.driver_id = rv.reviewee_id
                    GROUP BY rv.reviewee_id) sr ON sr.did = p.id
        CROSS JOIN LATERAL (VALUES
            ('rides',      COALESCE(rd.rides, 0)::numeric),
            ('deliveries', COALESCE(rd.deliveries, 0)::numeric),
            ('stars',      COALESCE(sr.stars, 0)::numeric),
            ('cancels',    COALESCE(rd.cancels, 0)::numeric)
        ) v(signal, units)
        WHERE p.is_active AND NOT COALESCE(p.is_blocked, false)
          AND EXISTS (SELECT 1 FROM public.driver_vehicles dv WHERE dv.driver_id = p.id);
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public._outdoor_units(text) FROM public, anon, authenticated;

-- ===== 5. O que o DONO vê: as missões da loja dele, o dia, a semana, a sequência e como isso entra no Outdoor =====
CREATE OR REPLACE FUNCTION public.get_store_missions(p_store uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner uuid; v_today date := public._mission_day(); v_missions jsonb; v_today_pts integer; v_today_total integer; v_week integer;
    v_streak integer := 0; v_d date; v_units numeric; v_w numeric; v_max numeric; v_active boolean; v_rank integer; v_of integer; v_store_pts numeric;
BEGIN
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = p_store;
    IF v_owner IS NULL OR v_owner IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'só o dono da loja vê as missões' USING ERRCODE = '42501';
    END IF;
    PERFORM public.evaluate_store_missions(p_store);       -- o que foi cumprido agora já entra no livro

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'code', st.code, 'kind', st.kind, 'title', st.title, 'hint', st.hint, 'points', st.points, 'dest', st.dest, 'done', st.done)
               ORDER BY (st.kind = 'daily') DESC, st.sort_order), '[]'::jsonb),
           COALESCE(sum(st.points) FILTER (WHERE st.kind = 'daily'), 0)
      INTO v_missions, v_today_total
      FROM public._store_mission_status(p_store) st WHERE st.applies;

    SELECT COALESCE(sum(points), 0) INTO v_today_pts FROM public.store_mission_awards WHERE store_id = p_store AND day = v_today;
    SELECT COALESCE(sum(points), 0) INTO v_week FROM public.store_mission_awards WHERE store_id = p_store AND day > v_today - 7;

    -- sequência: dias seguidos com ao menos uma missão do dia cumprida (hoje ainda sem nada não quebra a sequência)
    v_d := v_today;
    IF NOT EXISTS (SELECT 1 FROM public.store_mission_awards WHERE store_id = p_store AND day = v_d) THEN v_d := v_d - 1; END IF;
    WHILE v_streak < 120 AND EXISTS (SELECT 1 FROM public.store_mission_awards WHERE store_id = p_store AND day = v_d) LOOP
        v_streak := v_streak + 1; v_d := v_d - 1;
    END LOOP;

    SELECT COALESCE(sum(units), 0) INTO v_units FROM public._store_mission_units() WHERE store_id = p_store;
    SELECT COALESCE(weight, 0), max_units, COALESCE(is_active, false) INTO v_w, v_max, v_active
      FROM public.outdoor_rules WHERE kind = 'lojas' AND signal = 'missions';
    SELECT COALESCE(points, 0) INTO v_store_pts FROM public.outdoor_scores WHERE kind = 'lojas' AND subject_id = p_store;
    SELECT count(*) + 1 INTO v_rank FROM public.outdoor_scores WHERE kind = 'lojas' AND points > COALESCE(v_store_pts, 0);
    SELECT count(*) INTO v_of FROM public.outdoor_scores WHERE kind = 'lojas';

    RETURN jsonb_build_object(
        'missions', v_missions,
        'today', jsonb_build_object('points', v_today_pts, 'total', v_today_total),
        'week_points', v_week,
        'streak_days', v_streak,
        'outdoor', jsonb_build_object(
            'active', COALESCE(v_active, false),
            'weight', COALESCE(v_w, 0),
            'mission_units', v_units,
            'points_from_missions', CASE WHEN v_active THEN round(COALESCE(v_w, 0) * LEAST(v_units, COALESCE(v_max, v_units)), 1) ELSE 0 END,
            'store_points', round(COALESCE(v_store_pts, 0), 1),
            'rank', v_rank,
            'stores', v_of));
END; $$;
REVOKE ALL ON FUNCTION public.get_store_missions(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_store_missions(uuid) TO authenticated, service_role;

-- ===== 6. Agenda e primeira carga =====
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'store-missions-eval';
        PERFORM cron.schedule('store-missions-eval', '*/5 * * * *', 'SELECT public.evaluate_store_missions()');
    END IF;
END $$;
SELECT public.evaluate_store_missions();
SELECT public.refresh_outdoor_scores();
