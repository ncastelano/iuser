-- Cenários de get_radar_metrics (migration 20261130000053). Roda LOCAL, numa transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/radar_metrics_scenarios.sql
-- Compara a função nova com a CONTA ANTIGA (uma subconsulta por loja/produto) e confere que cabe nos limites de tempo do servidor.
BEGIN;
DO $$
DECLARE
    v_new jsonb; v_t0 timestamptz; v_ms numeric; r record; v_old_sales numeric; v_old_comments numeric; v_old_followers numeric; v_got jsonb; v_n int := 0;
BEGIN
    v_t0 := clock_timestamp();
    v_new := public.get_radar_metrics();
    v_ms := extract(epoch FROM clock_timestamp() - v_t0) * 1000;

    -- 1) cabe nos limites do servidor (8 s logado, 3 s visitante); com folga larga
    IF v_ms > 1500 THEN RAISE EXCEPTION 'FALHA 1: get_radar_metrics demorou % ms', round(v_ms); END IF;

    -- 2) o formato é o que o Radar lê
    IF jsonb_typeof(v_new->'stores') <> 'object' OR jsonb_typeof(v_new->'products') <> 'object' THEN RAISE EXCEPTION 'FALHA 2: formato'; END IF;

    -- 3) TODA loja está lá e bate com a conta antiga
    FOR r IN SELECT st.id FROM public.stores st LOOP
        SELECT (SELECT count(*) FROM public.orders o WHERE o.store_id = r.id AND o.status = 'paid'),
               (SELECT count(*) FROM public.comments c JOIN public.products p ON p.id = c.publication_id WHERE p.store_id = r.id)
                 + (SELECT count(*) FROM public.product_reviews x WHERE x.store_id = r.id AND btrim(COALESCE(x.comment, '')) <> ''),
               (SELECT count(*) FROM public.follows f WHERE f.following_id = r.id)
          INTO v_old_sales, v_old_comments, v_old_followers;
        v_got := v_new->'stores'->(r.id::text);
        IF v_got IS NULL THEN RAISE EXCEPTION 'FALHA 3: loja % ausente', r.id; END IF;
        IF (v_got->>'sales')::numeric <> v_old_sales OR (v_got->>'comments')::numeric <> v_old_comments OR (v_got->>'followers')::numeric <> v_old_followers THEN
            RAISE EXCEPTION 'FALHA 3b: loja % diferente (% vs % / % vs % / % vs %)', r.id, v_got->>'sales', v_old_sales, v_got->>'comments', v_old_comments, v_got->>'followers', v_old_followers;
        END IF;
    END LOOP;

    -- 4) uma amostra de produtos: com número = igual à conta antiga; sem número = fora do resultado (o Radar trata como 0)
    FOR r IN SELECT p.id FROM public.products p ORDER BY md5(p.id::text) LIMIT 300 LOOP
        SELECT COALESCE((SELECT sum(oi.quantity) FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.product_id = r.id AND o.status = 'paid'), 0),
               (SELECT count(*) FROM public.comments c WHERE c.publication_id = r.id)
                 + (SELECT count(*) FROM public.product_reviews x WHERE x.product_id = r.id AND btrim(COALESCE(x.comment, '')) <> '')
          INTO v_old_sales, v_old_comments;
        v_got := v_new->'products'->(r.id::text);
        IF v_old_sales + v_old_comments > 0 THEN
            IF v_got IS NULL OR (v_got->>'sales')::numeric <> v_old_sales OR (v_got->>'comments')::numeric <> v_old_comments THEN
                RAISE EXCEPTION 'FALHA 4: produto % diferente (%)', r.id, v_got;
            END IF;
            v_n := v_n + 1;
        ELSIF v_got IS NOT NULL THEN
            RAISE EXCEPTION 'FALHA 4b: produto % sem número apareceu (%)', r.id, v_got;
        END IF;
    END LOOP;
    IF v_n = 0 THEN RAISE NOTICE 'aviso: nenhum produto da amostra tinha número (base pequena)'; END IF;

    -- 5) quem não tem acesso direto às tabelas recebe só os números (a função é SECURITY DEFINER e devolve só contagens, sem nomes nem ids de pessoas)
    IF v_new::text ~* '(email|phone|cpf|name)' THEN RAISE EXCEPTION 'FALHA 5: a resposta traz campo pessoal'; END IF;

    RAISE NOTICE 'OK — 5 cenários de get_radar_metrics passaram (% ms, % produtos conferidos com número)', round(v_ms), v_n;
END $$;
ROLLBACK;
