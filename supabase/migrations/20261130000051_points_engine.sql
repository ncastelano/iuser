-- MOTOR ÚNICO DE PONTUAÇÃO (Fase 1): pessoas, lojas, serviços, produtos, digitais, imóveis e motoristas no mesmo desenho.
--
--  • Dois tipos de regra, uma só tela no Admin (Admin → Pontuação):
--      EVENTO  (point_rules, livro-caixa profile_points_events): "alguém fez X" dá N pontos, uma vez por referência, com limite por dia,
--              limite total, vigência (campanha) e valor NEGATIVO (penalidade). Quem emite o evento é um gatilho; o admin cria quantas
--              regras quiser em cima de um evento do catálogo (point_events) — "Nova tarefa".
--      SINAL   (outdoor_rules): peso × número que o banco já tem (vendas, estrelas, seguidores...), calculado e GUARDADO em
--              outdoor_scores (atualizado a cada 5 min), nunca a cada visita. `rolls_up` diz se o sinal também soma no total do DONO.
--  • Sete Outdoors: lojas, serviços, produtos, digitais, imóveis, motoristas (novos: digitais e motoristas) e pessoas.
--  • PLACAR DO PERFIL (profile_scores): pontos da pessoa + o que as áreas dela rendem (só sinais com rolls_up), por área, mais o
--    BÔNUS DE DIVERSIDADE (+10% por área extra, até +30%, só se nenhuma área passa de 60% do total). O total novo roda em
--    PARALELO: `points_settings.use_total_score` (desligado) decide se "Outdoor iUser" e "Melhores perfis" já usam o total novo.
--  • "Seguir" estava inflável (5 pontos, 20 por dia = 100/dia): passa a 2 pontos e 10/dia (só se o admin ainda não mexeu) e
--    "ganhar seguidor" não conta se quem seguiu criou a conta há menos de 1 dia.
-- Tudo só pelas funções e pelo servidor: as tabelas novas não têm acesso do app. Rollback: supabase/rollbacks/points_engine_rollback.sql

-- ===== 1. Configurações do total do perfil (uma linha só) =====
CREATE TABLE IF NOT EXISTS public.points_settings (
    id                    boolean PRIMARY KEY DEFAULT true CHECK (id),
    use_total_score       boolean NOT NULL DEFAULT false,                       -- o Outdoor iUser e "Melhores perfis" usam o total novo?
    diversity_step        numeric NOT NULL DEFAULT 0.10 CHECK (diversity_step BETWEEN 0 AND 1),   -- bônus por área extra
    diversity_max         numeric NOT NULL DEFAULT 0.30 CHECK (diversity_max BETWEEN 0 AND 2),    -- bônus máximo
    diversity_max_share   numeric NOT NULL DEFAULT 0.60 CHECK (diversity_max_share > 0 AND diversity_max_share <= 1),  -- a maior área não passa disto do total
    diversity_min_points  integer NOT NULL DEFAULT 10 CHECK (diversity_min_points >= 1),          -- pontos para uma área contar como "ativa"
    refreshed_at          timestamptz,
    updated_at            timestamptz NOT NULL DEFAULT now(),
    updated_by            uuid
);
INSERT INTO public.points_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.points_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.points_settings FROM anon, authenticated;

-- ===== 2. Sinais (outdoor_rules): novos tipos, pesos negativos, "soma no dono" e teto de unidades =====
DO $$
DECLARE c record;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'public.outdoor_rules'::regclass AND contype = 'c'
                AND (pg_get_constraintdef(oid) ILIKE '%weight%' OR pg_get_constraintdef(oid) ILIKE '%kind%') LOOP
        EXECUTE format('ALTER TABLE public.outdoor_rules DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;
ALTER TABLE public.outdoor_rules ADD CONSTRAINT outdoor_rules_kind_check CHECK (kind IN ('lojas','servicos','produtos','digitais','imoveis','motoristas'));
ALTER TABLE public.outdoor_rules ADD CONSTRAINT outdoor_rules_weight_range CHECK (weight BETWEEN -1000 AND 1000);
ALTER TABLE public.outdoor_rules ADD COLUMN IF NOT EXISTS rolls_up   boolean NOT NULL DEFAULT false;     -- também soma no total do dono (Placar do perfil)
ALTER TABLE public.outdoor_rules ADD COLUMN IF NOT EXISTS max_units  numeric CHECK (max_units IS NULL OR max_units > 0);   -- teto de unidades que contam (ex.: 50 produtos)
ALTER TABLE public.outdoor_rules ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.outdoor_rules ADD COLUMN IF NOT EXISTS updated_by uuid;

INSERT INTO public.outdoor_rules (kind, signal, label, weight, is_active, rolls_up, sort_order) VALUES
    ('lojas',      'rejected',   'Pedido recusado ou cancelado pela loja',        -3,   false, true, 8),
    ('digitais',   'sales',      'Venda concluída (acesso liberado)',              3,   true,  true, 1),
    ('digitais',   'claims',     'Pessoa que pegou de graça',                      1,   true,  true, 2),
    ('digitais',   'stars',      'Estrela recebida nas avaliações',                1,   true,  true, 3),
    ('digitais',   'downloads',  'Download de programa',                           0.2, true,  false, 4),
    ('digitais',   'shares',     'Compartilhamento do produto',                    1,   true,  false, 5),
    ('digitais',   'views',      'Visita ao produto',                              0.05, true, false, 6),
    ('motoristas', 'rides',      'Corrida de passageiro concluída',                3,   true,  true, 1),
    ('motoristas', 'deliveries', 'Entrega de loja concluída',                      2,   true,  true, 2),
    ('motoristas', 'stars',      'Estrela recebida nas avaliações',                1,   true,  true, 3),
    ('motoristas', 'cancels',    'Corrida cancelada pelo motorista depois de aceitar', -5, false, true, 4)
ON CONFLICT (kind, signal) DO NOTHING;
-- o que também soma no total do dono: o que mostra trabalho de verdade (venda, cliente, nota, seguidor, serviço feito, visita feita).
-- Visita à página, compartilhamento e anúncio ativo ficam de fora (fáceis de inflar); produto fica de fora porque a venda já conta na loja.
UPDATE public.outdoor_rules SET rolls_up = true
 WHERE (kind, signal) IN (('lojas','sales'),('lojas','customers'),('lojas','stars'),('lojas','followers'),('servicos','bookings'),('servicos','stars'),('imoveis','visits'));
UPDATE public.outdoor_rules SET max_units = 50 WHERE kind = 'lojas' AND signal = 'listings' AND max_units IS NULL;

-- ===== 3. Números de cada item (UMA linha por item e sinal) e a pontuação =====
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
        CROSS JOIN LATERAL (VALUES
            ('sales',     COALESCE(od.sales, 0)::numeric),
            ('customers', COALESCE(od.customers, 0)::numeric),
            ('stars',     COALESCE(s.ratings_avg, 0)::numeric * COALESCE(s.ratings_count, 0)),
            ('followers', COALESCE(f.n, 0)::numeric),
            ('views',     COALESCE(s.view_count, 0)::numeric),
            ('listings',  COALESCE(l.n, 0)::numeric),
            ('shares',    COALESCE(s.share_count, 0)::numeric),
            ('rejected',  COALESCE(od.rejected, 0)::numeric)
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

-- pontos de cada item de um tipo: `points` = tudo; `rolled` = só o que também soma no total do dono
DROP FUNCTION IF EXISTS public._outdoor_scores(text);    -- a antiga: o nome colide com o tipo-array da tabela nova outdoor_scores (`_outdoor_scores('x')` viraria conversão de tipo)
DROP FUNCTION IF EXISTS public._outdoor_compute(text);
CREATE FUNCTION public._outdoor_compute(p_kind text)
RETURNS TABLE(id uuid, owner_id uuid, points numeric, rolled numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
    IF p_kind = 'pessoas' THEN
        -- pessoas: o livro-caixa (ou, com a chave ligada, o total do Placar)
        RETURN QUERY
        SELECT p.id, p.id,
               (CASE WHEN st.use_total_score THEN COALESCE(ps.total, 0) ELSE COALESCE(pp.total, 0) END)::numeric,
               0::numeric
        FROM public.profiles p
        CROSS JOIN public.points_settings st
        LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
        LEFT JOIN public.profile_scores ps ON ps.profile_id = p.id
        WHERE p.is_active AND NOT COALESCE(p.is_blocked, false)
          AND (CASE WHEN st.use_total_score THEN ps.profile_id IS NOT NULL ELSE pp.profile_id IS NOT NULL END);
    ELSE
        RETURN QUERY
        SELECT u.id, u.owner_id,
               sum(r.weight * LEAST(u.units, COALESCE(r.max_units, u.units)))::numeric,
               COALESCE(sum(r.weight * LEAST(u.units, COALESCE(r.max_units, u.units))) FILTER (WHERE r.rolls_up), 0)::numeric
        FROM public._outdoor_units(p_kind) u
        JOIN public.outdoor_rules r ON r.kind = p_kind AND r.signal = u.signal AND r.is_active
        GROUP BY u.id, u.owner_id;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public._outdoor_compute(text) FROM public, anon, authenticated;

-- ===== 4. Pontos guardados: por item (Outdoor) e por perfil (Placar) =====
CREATE TABLE IF NOT EXISTS public.outdoor_scores (
    kind       text NOT NULL,
    subject_id uuid NOT NULL,
    owner_id   uuid,
    points     numeric NOT NULL,
    rolled     numeric NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, subject_id)
);
CREATE INDEX IF NOT EXISTS outdoor_scores_rank_idx  ON public.outdoor_scores (kind, points DESC);
CREATE INDEX IF NOT EXISTS outdoor_scores_owner_idx ON public.outdoor_scores (owner_id) WHERE rolled <> 0;
ALTER TABLE public.outdoor_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outdoor_scores FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.profile_scores (
    profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    pessoa     numeric NOT NULL DEFAULT 0,
    lojas      numeric NOT NULL DEFAULT 0,
    servicos   numeric NOT NULL DEFAULT 0,
    produtos   numeric NOT NULL DEFAULT 0,
    digitais   numeric NOT NULL DEFAULT 0,
    imoveis    numeric NOT NULL DEFAULT 0,
    motoristas numeric NOT NULL DEFAULT 0,
    raw        numeric NOT NULL DEFAULT 0,      -- soma das áreas (nunca negativa)
    bonus_pct  numeric NOT NULL DEFAULT 0,      -- bônus de diversidade (0.2 = +20%)
    total      integer NOT NULL DEFAULT 0,      -- raw × (1 + bônus)
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_scores_total_idx ON public.profile_scores (total DESC);
ALTER TABLE public.profile_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_scores FROM anon, authenticated;

-- Recalcula tudo (a cada 5 min pelo pg_cron e quando o admin muda uma regra). Troca num bloco só: quem lê vê o placar antigo até terminar.
CREATE OR REPLACE FUNCTION public.refresh_outdoor_scores()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; s public.points_settings;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('refresh_outdoor_scores'));
    FOREACH k IN ARRAY ARRAY['lojas','servicos','produtos','digitais','imoveis','motoristas'] LOOP
        DELETE FROM public.outdoor_scores WHERE kind = k;
        INSERT INTO public.outdoor_scores (kind, subject_id, owner_id, points, rolled)
        SELECT k, t.id, t.owner_id, t.points, t.rolled FROM public._outdoor_compute(k) t WHERE t.points <> 0 OR t.rolled <> 0;
    END LOOP;

    SELECT * INTO s FROM public.points_settings WHERE id;
    DELETE FROM public.profile_scores;
    INSERT INTO public.profile_scores (profile_id, pessoa, lojas, servicos, produtos, digitais, imoveis, motoristas, raw, bonus_pct, total)
    WITH a AS (
        SELECT o.owner_id AS pid,
               COALESCE(sum(o.rolled) FILTER (WHERE o.kind = 'lojas'), 0)      AS lojas,
               COALESCE(sum(o.rolled) FILTER (WHERE o.kind = 'servicos'), 0)   AS servicos,
               COALESCE(sum(o.rolled) FILTER (WHERE o.kind = 'produtos'), 0)   AS produtos,
               COALESCE(sum(o.rolled) FILTER (WHERE o.kind = 'digitais'), 0)   AS digitais,
               COALESCE(sum(o.rolled) FILTER (WHERE o.kind = 'imoveis'), 0)    AS imoveis,
               COALESCE(sum(o.rolled) FILTER (WHERE o.kind = 'motoristas'), 0) AS motoristas
          FROM public.outdoor_scores o WHERE o.owner_id IS NOT NULL AND o.rolled <> 0 GROUP BY o.owner_id
    ), b AS (
        SELECT p.id AS pid, GREATEST(COALESCE(pp.total, 0), 0)::numeric AS pessoa,
               COALESCE(a.lojas, 0) AS lojas, COALESCE(a.servicos, 0) AS servicos, COALESCE(a.produtos, 0) AS produtos,
               COALESCE(a.digitais, 0) AS digitais, COALESCE(a.imoveis, 0) AS imoveis, COALESCE(a.motoristas, 0) AS motoristas
          FROM public.profiles p
          LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
          LEFT JOIN a ON a.pid = p.id
         WHERE p.is_active AND (pp.profile_id IS NOT NULL OR a.pid IS NOT NULL)
    ), c AS (
        SELECT b.*, GREATEST(0, b.pessoa + b.lojas + b.servicos + b.produtos + b.digitais + b.imoveis + b.motoristas) AS raw,
               (SELECT count(*) FROM unnest(ARRAY[b.pessoa, b.lojas, b.servicos, b.produtos, b.digitais, b.imoveis, b.motoristas]) x WHERE x >= s.diversity_min_points) AS n,
               (SELECT max(x) FROM unnest(ARRAY[b.pessoa, b.lojas, b.servicos, b.produtos, b.digitais, b.imoveis, b.motoristas]) x) AS top
          FROM b
    ), d AS (
        SELECT c.*, CASE WHEN c.n > 1 AND c.raw > 0 AND c.top / NULLIF(c.raw, 0) <= s.diversity_max_share
                         THEN LEAST(s.diversity_max, s.diversity_step * (c.n - 1)) ELSE 0 END AS bonus
          FROM c
    )
    SELECT d.pid, d.pessoa, d.lojas, d.servicos, d.produtos, d.digitais, d.imoveis, d.motoristas, d.raw, d.bonus, round(d.raw * (1 + d.bonus))::integer FROM d;

    UPDATE public.points_settings SET refreshed_at = now() WHERE id;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_outdoor_scores() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_outdoor_scores() TO service_role;

-- ===== 5. Eventos: catálogo, regras com vigência/limite total/negativo e "Nova tarefa" =====
CREATE TABLE IF NOT EXISTS public.point_events (
    event       text PRIMARY KEY CHECK (event ~ '^[a-z0-9_]{3,40}$'),
    label       text NOT NULL,
    description text,
    sort_order  integer NOT NULL DEFAULT 0
);
ALTER TABLE public.point_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.point_events FROM anon, authenticated;
INSERT INTO public.point_events (event, label, description, sort_order) VALUES
    ('invite_signup',       'Convidar alguém',               'Uma pessoa criou a conta pelo convite',                          1),
    ('service_published',   'Publicar um serviço',           'Publicar um serviço no perfil ou na loja',                       2),
    ('follow_given',        'Seguir alguém',                 'Seguir um perfil ou uma loja',                                   3),
    ('follow_received',     'Ganhar um seguidor',            'Alguém (conta com mais de 1 dia) passou a seguir',               4),
    ('publication_created', 'Publicar uma imagem no perfil', 'Publicar uma imagem/publicação no perfil',                       5),
    ('purchase_completed',  'Concluir uma compra',           'Um pedido da pessoa foi concluído (não vale na própria loja)',   6),
    ('review_given',        'Avaliar uma compra',            'A pessoa avaliou um produto',                                    7)
ON CONFLICT (event) DO NOTHING;

ALTER TABLE public.point_rules ADD COLUMN IF NOT EXISTS event     text;
ALTER TABLE public.point_rules ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE public.point_rules ADD COLUMN IF NOT EXISTS ends_at   timestamptz;
ALTER TABLE public.point_rules ADD COLUMN IF NOT EXISTS max_total integer CHECK (max_total IS NULL OR max_total > 0);   -- quantas vezes no total a pessoa pode ganhar esta regra
UPDATE public.point_rules SET event = action WHERE event IS NULL;
ALTER TABLE public.point_rules ALTER COLUMN event SET NOT NULL;
ALTER TABLE public.point_rules DROP CONSTRAINT IF EXISTS point_rules_event_fkey;
ALTER TABLE public.point_rules ADD CONSTRAINT point_rules_event_fkey FOREIGN KEY (event) REFERENCES public.point_events(event) ON UPDATE CASCADE;
ALTER TABLE public.point_rules DROP CONSTRAINT IF EXISTS point_rules_points_check;
ALTER TABLE public.point_rules DROP CONSTRAINT IF EXISTS point_rules_points_range;
ALTER TABLE public.point_rules ADD CONSTRAINT point_rules_points_range CHECK (points BETWEEN -100000 AND 100000);
ALTER TABLE public.point_rules DROP CONSTRAINT IF EXISTS point_rules_action_check;
ALTER TABLE public.point_rules ADD CONSTRAINT point_rules_action_check CHECK (action ~ '^[a-z0-9_]{3,40}$');
ALTER TABLE public.point_rules DROP CONSTRAINT IF EXISTS point_rules_window_check;
ALTER TABLE public.point_rules ADD CONSTRAINT point_rules_window_check CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);
CREATE INDEX IF NOT EXISTS point_rules_event_idx ON public.point_rules (event) WHERE is_active;

-- regras novas, DESLIGADAS (nada muda no ranking até o admin ligar)
INSERT INTO public.point_rules (action, label, description, points, daily_limit, is_active, sort_order, event) VALUES
    ('purchase_completed', 'Concluir uma compra', 'Um pedido seu foi concluído',  5, 3, false, 6, 'purchase_completed'),
    ('review_given',       'Avaliar uma compra',  'Você avaliou um produto',      10, 5, false, 7, 'review_given')
ON CONFLICT (action) DO NOTHING;
-- "seguir" inflável: só mexe se o admin ainda não tinha mudado do valor original
UPDATE public.point_rules SET points = 2, daily_limit = 10, updated_at = now() WHERE action = 'follow_given' AND points = 5 AND daily_limit = 20;

-- Dá os pontos de um EVENTO a uma pessoa: cada regra ligada, dentro da vigência e dos limites, rende uma vez por referência.
-- (p_action é o código do evento; todas as regras do evento valem — assim uma campanha soma com a regra normal.)
CREATE OR REPLACE FUNCTION public._award_points(p_profile uuid, p_action text, p_ref text, p_at timestamptz DEFAULT now(), p_enforce_limit boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.point_rules; v_today int; v_total int; v_new int;
BEGIN
    IF p_profile IS NULL THEN RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile) THEN RETURN; END IF;
    FOR r IN SELECT * FROM public.point_rules
              WHERE event = p_action AND is_active AND points <> 0
                AND (starts_at IS NULL OR p_at >= starts_at) AND (ends_at IS NULL OR p_at <= ends_at)
              ORDER BY action LOOP
        IF p_enforce_limit THEN
            IF r.daily_limit IS NOT NULL THEN
                SELECT count(*) INTO v_today FROM public.profile_points_events
                 WHERE profile_id = p_profile AND action = r.action AND created_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
                IF v_today >= r.daily_limit THEN CONTINUE; END IF;
            END IF;
            IF r.max_total IS NOT NULL THEN
                SELECT count(*) INTO v_total FROM public.profile_points_events WHERE profile_id = p_profile AND action = r.action;
                IF v_total >= r.max_total THEN CONTINUE; END IF;
            END IF;
        END IF;
        INSERT INTO public.profile_points_events (profile_id, action, points, ref, created_at) VALUES (p_profile, r.action, r.points, p_ref, p_at)
        ON CONFLICT (profile_id, action, ref) DO NOTHING;
        GET DIAGNOSTICS v_new = ROW_COUNT;
        IF v_new > 0 THEN
            INSERT INTO public.profile_points (profile_id, total) VALUES (p_profile, r.points)
            ON CONFLICT (profile_id) DO UPDATE SET total = public.profile_points.total + EXCLUDED.total, updated_at = now();
        END IF;
    END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public._award_points(uuid, text, text, timestamptz, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._award_points(uuid, text, text, timestamptz, boolean) TO service_role;

-- Gatilhos: seguir (conta com menos de 1 dia não rende ao seguido), compra concluída e avaliação.
-- Os dois novos NUNCA derrubam o pedido/avaliação: qualquer erro de pontuação é engolido.
CREATE OR REPLACE FUNCTION public.trg_points_follow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.follower_id IS DISTINCT FROM NEW.following_id THEN
        PERFORM public._award_points(NEW.follower_id, 'follow_given', NEW.following_id::text);
        IF EXISTS (SELECT 1 FROM public.profiles f WHERE f.id = NEW.follower_id AND f.created_at <= now() - interval '1 day') THEN
            PERFORM public._award_points(NEW.following_id, 'follow_received', NEW.follower_id::text);
        END IF;
    END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_points_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.buyer_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = NEW.store_id AND s.owner_id = NEW.buyer_id) THEN
        BEGIN PERFORM public._award_points(NEW.buyer_id, 'purchase_completed', NEW.id::text); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS orders_points ON public.orders;
CREATE TRIGGER orders_points AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_points_order();

CREATE OR REPLACE FUNCTION public.trg_points_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.profile_id IS NOT NULL THEN
        BEGIN PERFORM public._award_points(NEW.profile_id, 'review_given', NEW.id::text); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS product_reviews_points ON public.product_reviews;
CREATE TRIGGER product_reviews_points AFTER INSERT ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION public.trg_points_review();

-- ===== 6. Leituras públicas =====
-- O OUTDOOR: os melhores de um tipo. Pessoas = livro-caixa (ou total do Placar); os demais saem dos pontos guardados.
CREATE OR REPLACE FUNCTION public.get_outdoor(p_kind text, p_limit integer DEFAULT 12)
RETURNS TABLE(id uuid, slug text, owner_slug text, name text, image text, points integer, rank integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_lim integer := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 200);
BEGIN
    IF p_kind NOT IN ('lojas','pessoas','servicos','produtos','digitais','imoveis','motoristas') THEN RETURN; END IF;
    IF p_kind = 'lojas' THEN
        RETURN QUERY
        SELECT s.id, s."storeSlug"::text, NULL::text, s.name::text, s.logo_url::text, round(o.points)::integer,
               (row_number() OVER (ORDER BY o.points DESC, s.id))::integer
        FROM public.outdoor_scores o JOIN public.stores s ON s.id = o.subject_id
        WHERE o.kind = 'lojas' AND o.points > 0 AND s.is_active ORDER BY o.points DESC, s.id LIMIT v_lim;
    ELSIF p_kind = 'pessoas' THEN
        RETURN QUERY
        SELECT p.id, p."profileSlug"::text, NULL::text, p.name::text, p.avatar_url::text, round(t.points)::integer,
               (row_number() OVER (ORDER BY t.points DESC, COALESCE(p.view_count, 0) DESC, p.id))::integer
        FROM public._outdoor_compute('pessoas') t JOIN public.profiles p ON p.id = t.id
        WHERE t.points > 0 AND p."profileSlug" IS NOT NULL ORDER BY t.points DESC, COALESCE(p.view_count, 0) DESC, p.id LIMIT v_lim;
    ELSIF p_kind = 'imoveis' THEN
        RETURN QUERY
        SELECT r.id, r.slug::text, NULL::text, r.title::text, (r.photos)[1]::text, round(o.points)::integer,
               (row_number() OVER (ORDER BY o.points DESC, r.id))::integer
        FROM public.outdoor_scores o JOIN public.rental_listings r ON r.id = o.subject_id
        WHERE o.kind = 'imoveis' AND o.points > 0 AND r.status = 'active' ORDER BY o.points DESC, r.id LIMIT v_lim;
    ELSIF p_kind = 'motoristas' THEN
        RETURN QUERY
        SELECT p.id, v.vehicle_slug::text, NULL::text, p.name::text, p.avatar_url::text, round(o.points)::integer,
               (row_number() OVER (ORDER BY o.points DESC, p.id))::integer
        FROM public.outdoor_scores o
        JOIN public.profiles p ON p.id = o.subject_id AND p.is_active AND NOT COALESCE(p.is_blocked, false)
        JOIN LATERAL (SELECT dv.vehicle_slug FROM public.driver_vehicles dv WHERE dv.driver_id = p.id AND dv.vehicle_slug IS NOT NULL ORDER BY dv.updated_at DESC LIMIT 1) v ON true
        WHERE o.kind = 'motoristas' AND o.points > 0 ORDER BY o.points DESC, p.id LIMIT v_lim;
    ELSE   -- servicos, produtos, digitais
        RETURN QUERY
        SELECT p.id, p.slug::text, COALESCE(s."storeSlug", ow."profileSlug")::text, p.name::text, p.image_url::text, round(o.points)::integer,
               (row_number() OVER (ORDER BY o.points DESC, p.id))::integer
        FROM public.outdoor_scores o JOIN public.products p ON p.id = o.subject_id
        LEFT JOIN public.stores s ON s.id = p.store_id
        LEFT JOIN public.profiles ow ON ow.id = p.owner_id
        WHERE o.kind = p_kind AND o.points > 0 AND p.is_active ORDER BY o.points DESC, p.id LIMIT v_lim;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.get_outdoor(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_outdoor(text, integer) TO anon, authenticated, service_role;

-- Como cada tipo pontua (para a folha "Como pontua"): o que vale agora, com os negativos também
CREATE OR REPLACE FUNCTION public.get_outdoor_rules(p_kind text)
RETURNS TABLE(label text, points numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT x.label, x.points FROM (
        SELECT r.label::text AS label, r.weight AS points, r.sort_order AS ord FROM public.outdoor_rules r
         WHERE p_kind <> 'pessoas' AND r.kind = p_kind AND r.is_active AND r.weight <> 0
        UNION ALL
        SELECT r.label::text, r.points::numeric, r.sort_order FROM public.point_rules r
         WHERE p_kind = 'pessoas' AND r.is_active AND r.points <> 0
           AND (r.starts_at IS NULL OR r.starts_at <= now()) AND (r.ends_at IS NULL OR r.ends_at >= now())
    ) x ORDER BY x.ord
$$;
REVOKE ALL ON FUNCTION public.get_outdoor_rules(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_outdoor_rules(text) TO anon, authenticated, service_role;

-- "Melhores perfis" e o selo de pontos dos cartões: livro-caixa ou, com a chave ligada, o total do Placar
CREATE OR REPLACE FUNCTION public.get_best_profiles(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, points integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, v.pts AS points
    FROM public.profiles p
    CROSS JOIN public.points_settings st
    LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
    LEFT JOIN public.profile_scores ps ON ps.profile_id = p.id
    CROSS JOIN LATERAL (SELECT (CASE WHEN st.use_total_score THEN COALESCE(ps.total, 0) ELSE COALESCE(pp.total, 0) END)::integer AS pts) v
    WHERE p.is_active
    ORDER BY v.pts DESC, COALESCE(p.view_count, 0) DESC, p.ratings_avg DESC NULLS LAST
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
$$;
REVOKE ALL ON FUNCTION public.get_best_profiles(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_best_profiles(integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_profiles_ranking_info(p_ids uuid[])
RETURNS TABLE(id uuid, points integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, (CASE WHEN st.use_total_score THEN COALESCE(ps.total, 0) ELSE COALESCE(pp.total, 0) END)::integer
    FROM public.profiles p
    CROSS JOIN public.points_settings st
    LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
    LEFT JOIN public.profile_scores ps ON ps.profile_id = p.id
    WHERE p.id = ANY (p_ids[1:200]);
$$;
REVOKE ALL ON FUNCTION public.get_profiles_ranking_info(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_profiles_ranking_info(uuid[]) TO anon, authenticated, service_role;

-- "Minha pontuação": as regras que valem agora (dentro da vigência)
CREATE OR REPLACE FUNCTION public.get_my_points()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'total', COALESCE((SELECT total FROM public.profile_points WHERE profile_id = auth.uid()), 0),
        'rules', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', r.action, 'label', r.label, 'description', r.description,
                    'points', r.points, 'daily_limit', r.daily_limit) ORDER BY r.sort_order) FROM public.point_rules r
                    WHERE r.is_active AND r.points > 0 AND (r.starts_at IS NULL OR r.starts_at <= now()) AND (r.ends_at IS NULL OR r.ends_at >= now())), '[]'::jsonb),
        'by_action', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', e.action, 'times', e.times, 'points', e.pts)) FROM (
                    SELECT action, count(*) AS times, sum(points) AS pts FROM public.profile_points_events WHERE profile_id = auth.uid() GROUP BY action) e), '[]'::jsonb)
    ) WHERE auth.uid() IS NOT NULL;
$$;

-- PLACAR DO PERFIL: pontos por área, bônus de diversidade e o total. Só números (nada de pedido, cliente ou valor).
CREATE OR REPLACE FUNCTION public.get_profile_scoreboard(p_profile uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := COALESCE(p_profile, auth.uid()); ps public.profile_scores; st public.points_settings; v_ledger integer;
BEGIN
    IF auth.uid() IS NULL OR v_id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO st FROM public.points_settings WHERE id;
    SELECT * INTO ps FROM public.profile_scores WHERE profile_id = v_id;
    SELECT COALESCE(total, 0) INTO v_ledger FROM public.profile_points WHERE profile_id = v_id;
    v_ledger := COALESCE(v_ledger, 0);
    RETURN jsonb_build_object(
        'areas', jsonb_build_object('pessoa', COALESCE(ps.pessoa, GREATEST(v_ledger, 0)), 'lojas', COALESCE(ps.lojas, 0), 'servicos', COALESCE(ps.servicos, 0),
                                    'produtos', COALESCE(ps.produtos, 0), 'digitais', COALESCE(ps.digitais, 0), 'imoveis', COALESCE(ps.imoveis, 0),
                                    'motoristas', COALESCE(ps.motoristas, 0)),
        'raw', COALESCE(ps.raw, GREATEST(v_ledger, 0)),
        'bonus_pct', COALESCE(ps.bonus_pct, 0),
        'total', COALESCE(ps.total, GREATEST(v_ledger, 0)),
        'ranking_points', CASE WHEN st.use_total_score THEN COALESCE(ps.total, 0) ELSE v_ledger END,
        'use_total', st.use_total_score,
        'updated_at', ps.updated_at);
END; $$;
REVOKE ALL ON FUNCTION public.get_profile_scoreboard(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_scoreboard(uuid) TO authenticated, service_role;

-- ===== 7. Agenda e primeira carga =====
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'points-refresh';
        PERFORM cron.schedule('points-refresh', '*/5 * * * *', 'SELECT public.refresh_outdoor_scores()');
    END IF;
END $$;
SELECT public.refresh_outdoor_scores();
