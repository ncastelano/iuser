-- ROLLBACK das MISSÕES DA LOJA (migration 20261130000055): devolve o Outdoor de lojas ao que era e apaga o que a migration criou.
-- Os prêmios do dia gravados em store_mission_awards SE PERDEM (a tabela é apagada).
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'store-missions-eval';
    END IF;
END $$;

-- 1) a função de unidades como era na 051 (sem o sinal `missions`) — antes de apagar o que ela usa
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

-- 2) o sinal sai do Outdoor
DELETE FROM public.outdoor_rules WHERE kind = 'lojas' AND signal = 'missions';
DELETE FROM public.outdoor_scores WHERE kind = 'lojas';

-- 3) funções e tabelas das missões
DROP FUNCTION IF EXISTS public.get_store_missions(uuid);
DROP FUNCTION IF EXISTS public._store_mission_units();
DROP FUNCTION IF EXISTS public.evaluate_store_missions(uuid);
DROP FUNCTION IF EXISTS public._store_mission_status(uuid);
DROP FUNCTION IF EXISTS public._mission_day();
DROP TABLE IF EXISTS public.store_mission_awards;
DROP TABLE IF EXISTS public.store_missions;

SELECT public.refresh_outdoor_scores();
