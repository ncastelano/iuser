-- OUTDOOR: vitrine por PONTUAÇÃO, padrão do app todo (home, /comprar, /social, /imoveis e o topo do /radar).
-- Cada tipo (lojas, pessoas, imóveis, serviços, produtos) tem a SUA regra de pontos, mas todos saem pela mesma
-- função `get_outdoor`. Pessoas seguem o livro-caixa que já existe (profile_points / point_rules, Admin → Pontuação);
-- os demais tipos usam `outdoor_rules` (peso de cada sinal, editável) sobre números que o banco já tem.
-- A leitura é pública (visitante vê o Outdoor) e devolve SÓ campos públicos: nome, @/slug, imagem e pontos.

CREATE TABLE IF NOT EXISTS public.outdoor_rules (
    kind       text NOT NULL CHECK (kind IN ('lojas','servicos','produtos','imoveis')),
    signal     text NOT NULL,
    label      text NOT NULL,
    weight     numeric NOT NULL CHECK (weight >= 0 AND weight <= 1000),   -- pontos por unidade do sinal
    is_active  boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    PRIMARY KEY (kind, signal)
);
ALTER TABLE public.outdoor_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outdoor_rules FROM anon, authenticated;   -- sem política: só as funções abaixo leem e escrevem

INSERT INTO public.outdoor_rules (kind, signal, label, weight, sort_order) VALUES
    ('lojas',    'sales',       'Venda concluída',                          3,    1),
    ('lojas',    'customers',   'Cliente diferente que já comprou',         2,    2),
    ('lojas',    'stars',       'Estrela recebida nas avaliações',          1,    3),
    ('lojas',    'followers',   'Seguidor da loja',                         2,    4),
    ('lojas',    'views',       'Visita à loja',                            0.05, 5),
    ('lojas',    'listings',    'Produto ou serviço ativo (até 50)',        1,    6),
    ('lojas',    'shares',      'Compartilhamento da loja',                 1,    7),
    ('servicos', 'views',       'Visita ao serviço',                        0.05, 1),
    ('servicos', 'stars',       'Estrela recebida nas avaliações',          1,    2),
    ('servicos', 'bookings',    'Serviço feito (agendamento concluído)',    5,    3),
    ('servicos', 'shares',      'Compartilhamento do serviço',              1,    4),
    ('produtos', 'views',       'Visita ao produto',                        0.05, 1),
    ('produtos', 'stars',       'Estrela recebida nas avaliações',          1,    2),
    ('produtos', 'sold',        'Unidade vendida (pedido concluído)',       1,    3),
    ('produtos', 'shares',      'Compartilhamento do produto',              1,    4),
    ('imoveis',  'listed',      'Anúncio ativo',                            1,    1),
    ('imoveis',  'views',       'Visita ao anúncio',                        0.1,  2),
    ('imoveis',  'visits',      'Visita ao imóvel concluída',               10,   3)
ON CONFLICT (kind, signal) DO NOTHING;

-- peso ativo de um sinal (0 se não existe ou está desligado)
CREATE OR REPLACE FUNCTION public._outdoor_w(p_kind text, p_signal text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT weight FROM public.outdoor_rules WHERE kind = p_kind AND signal = p_signal AND is_active), 0);
$$;
REVOKE ALL ON FUNCTION public._outdoor_w(text, text) FROM public, anon, authenticated;

-- pontos de cada item de um tipo (só quem pontua > 0 entra)
CREATE OR REPLACE FUNCTION public._outdoor_scores(p_kind text)
RETURNS TABLE(id uuid, points numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_kind = 'lojas' THEN
        RETURN QUERY
        SELECT s.id,
               public._outdoor_w('lojas','sales')     * COALESCE(o.sales, 0)
             + public._outdoor_w('lojas','customers') * COALESCE(o.customers, 0)
             + public._outdoor_w('lojas','stars')     * COALESCE(s.ratings_avg, 0) * COALESCE(s.ratings_count, 0)
             + public._outdoor_w('lojas','followers') * COALESCE(f.n, 0)
             + public._outdoor_w('lojas','views')     * COALESCE(s.view_count, 0)
             + public._outdoor_w('lojas','listings')  * LEAST(COALESCE(l.n, 0), 50)
             + public._outdoor_w('lojas','shares')    * COALESCE(s.share_count, 0)
        FROM public.stores s
        JOIN public.profiles pr ON pr.id = s.owner_id AND pr.is_active AND NOT COALESCE(pr.is_blocked, false)
        LEFT JOIN (SELECT store_id, count(*) AS sales, count(DISTINCT buyer_id) AS customers FROM public.orders WHERE status = 'paid' GROUP BY store_id) o ON o.store_id = s.id
        LEFT JOIN (SELECT following_id, count(*) AS n FROM public.follows GROUP BY following_id) f ON f.following_id = s.id
        LEFT JOIN (SELECT store_id, count(*) AS n FROM public.products WHERE is_active AND listing_type = 'sale' GROUP BY store_id) l ON l.store_id = s.id
        WHERE s.is_active;
    ELSIF p_kind = 'pessoas' THEN
        RETURN QUERY
        SELECT p.id, COALESCE(pp.total, 0)::numeric
        FROM public.profiles p
        JOIN public.profile_points pp ON pp.profile_id = p.id
        WHERE p.is_active AND NOT COALESCE(p.is_blocked, false);
    ELSIF p_kind = 'servicos' THEN
        RETURN QUERY
        SELECT p.id,
               public._outdoor_w('servicos','views')    * COALESCE(p.view_count, 0)
             + public._outdoor_w('servicos','stars')    * COALESCE(p.ratings_avg, 0) * COALESCE(p.ratings_count, 0)
             + public._outdoor_w('servicos','bookings') * COALESCE(a.n, 0)
             + public._outdoor_w('servicos','shares')   * COALESCE(p.share_count, 0)
        FROM public.products p
        LEFT JOIN (SELECT service_id, count(*) AS n FROM public.appointments WHERE completed_at IS NOT NULL AND service_id IS NOT NULL GROUP BY service_id) a ON a.service_id = p.id
        WHERE p.is_active AND p.type = 'service';
    ELSIF p_kind = 'produtos' THEN
        RETURN QUERY
        SELECT p.id,
               public._outdoor_w('produtos','views')  * COALESCE(p.view_count, 0)
             + public._outdoor_w('produtos','stars')  * COALESCE(p.ratings_avg, 0) * COALESCE(p.ratings_count, 0)
             + public._outdoor_w('produtos','sold')   * COALESCE(i.n, 0)
             + public._outdoor_w('produtos','shares') * COALESCE(p.share_count, 0)
        FROM public.products p
        LEFT JOIN (SELECT oi.product_id, sum(oi.quantity) AS n FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE o.status = 'paid' GROUP BY oi.product_id) i ON i.product_id = p.id
        WHERE p.is_active AND p.type = 'physical' AND p.listing_type = 'sale';
    ELSIF p_kind = 'imoveis' THEN
        RETURN QUERY
        SELECT r.id,
               public._outdoor_w('imoveis','listed') + public._outdoor_w('imoveis','views') * COALESCE(r.view_count, 0)
             + public._outdoor_w('imoveis','visits') * COALESCE(a.n, 0)
        FROM public.rental_listings r
        LEFT JOIN (SELECT rental_listing_id, count(*) AS n FROM public.appointments WHERE completed_at IS NOT NULL AND rental_listing_id IS NOT NULL GROUP BY rental_listing_id) a ON a.rental_listing_id = r.id
        WHERE r.status = 'active';
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public._outdoor_scores(text) FROM public, anon, authenticated;

-- O OUTDOOR: os melhores de um tipo, do maior pro menor ponto (empate: id estável). Só campos públicos.
CREATE OR REPLACE FUNCTION public.get_outdoor(p_kind text, p_limit integer DEFAULT 12)
RETURNS TABLE(id uuid, slug text, owner_slug text, name text, image text, points integer, rank integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lim integer := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 200);
BEGIN
    IF p_kind NOT IN ('lojas','pessoas','servicos','produtos','imoveis') THEN RETURN; END IF;
    IF p_kind = 'lojas' THEN
        RETURN QUERY
        SELECT s.id, s."storeSlug"::text, NULL::text, s.name::text, s.logo_url::text, round(t.points)::integer,
               (row_number() OVER (ORDER BY t.points DESC, s.id))::integer
        FROM public._outdoor_scores('lojas') t JOIN public.stores s ON s.id = t.id
        WHERE t.points > 0 ORDER BY t.points DESC, s.id LIMIT v_lim;
    ELSIF p_kind = 'pessoas' THEN
        RETURN QUERY
        SELECT p.id, p."profileSlug"::text, NULL::text, p.name::text, p.avatar_url::text, round(t.points)::integer,
               (row_number() OVER (ORDER BY t.points DESC, COALESCE(p.view_count, 0) DESC, p.id))::integer
        FROM public._outdoor_scores('pessoas') t JOIN public.profiles p ON p.id = t.id
        WHERE t.points > 0 AND p."profileSlug" IS NOT NULL ORDER BY t.points DESC, COALESCE(p.view_count, 0) DESC, p.id LIMIT v_lim;
    ELSIF p_kind = 'imoveis' THEN
        RETURN QUERY
        SELECT r.id, r.slug::text, NULL::text, r.title::text, (r.photos)[1]::text, round(t.points)::integer,
               (row_number() OVER (ORDER BY t.points DESC, r.id))::integer
        FROM public._outdoor_scores('imoveis') t JOIN public.rental_listings r ON r.id = t.id
        WHERE t.points > 0 ORDER BY t.points DESC, r.id LIMIT v_lim;
    ELSE
        RETURN QUERY
        SELECT p.id, p.slug::text, COALESCE(s."storeSlug", o."profileSlug")::text, p.name::text, p.image_url::text, round(t.points)::integer,
               (row_number() OVER (ORDER BY t.points DESC, p.id))::integer
        FROM public._outdoor_scores(p_kind) t JOIN public.products p ON p.id = t.id
        LEFT JOIN public.stores s ON s.id = p.store_id
        LEFT JOIN public.profiles o ON o.id = p.owner_id
        WHERE t.points > 0 ORDER BY t.points DESC, p.id LIMIT v_lim;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.get_outdoor(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_outdoor(text, integer) TO anon, authenticated, service_role;

-- Como cada tipo pontua (para a tela explicar). Pessoas vêm das regras de Admin → Pontuação.
CREATE OR REPLACE FUNCTION public.get_outdoor_rules(p_kind text)
RETURNS TABLE(label text, points numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT r.label::text, r.weight FROM public.outdoor_rules r
     WHERE p_kind <> 'pessoas' AND r.kind = p_kind AND r.is_active AND r.weight > 0
    UNION ALL
    SELECT r.label::text, r.points::numeric FROM public.point_rules r
     WHERE p_kind = 'pessoas' AND r.is_active AND r.points > 0;
$$;
REVOKE ALL ON FUNCTION public.get_outdoor_rules(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_outdoor_rules(text) TO anon, authenticated, service_role;
