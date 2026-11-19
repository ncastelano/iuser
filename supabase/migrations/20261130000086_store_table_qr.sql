-- 20261130000086_store_table_qr.sql
--
-- QR NA MESA (18/11/2026): a loja imprime cartões de mesa/balcão com a LOGO dela e um QR que abre o cardápio no iUser
-- (/<loja>/catalogo?mesa=N). Aqui só se CONTA quantas vezes o QR foi lido, por dia e por mesa, para a loja (e o iUser) medirem a divulgação.
--   - record_qr_scan(loja, mesa): visitante ou logado; nada de quem leu é guardado (só a contagem). Contra inflar: logado conta 1 vez por dia
--     por loja; visitante tem o teto por hora por loja (_counter_allow, migration 079).
--   - get_store_qr_stats(loja): só a dona; hoje, 7 e 30 dias e as mesas que mais leem.
-- Rollback: supabase/rollbacks/store_table_qr_rollback.sql.

CREATE TABLE IF NOT EXISTS public.store_qr_scans (
    store_id  uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    day       date NOT NULL,
    table_no  int  NOT NULL DEFAULT 0 CHECK (table_no BETWEEN 0 AND 500),
    scans     int  NOT NULL DEFAULT 0,
    PRIMARY KEY (store_id, day, table_no)
);
ALTER TABLE public.store_qr_scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_qr_scans FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_qr_scan(p_store uuid, p_table int DEFAULT 0) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t int := COALESCE(p_table, 0);
BEGIN
    IF v_t < 0 OR v_t > 500 THEN v_t := 0; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND is_active) THEN RETURN; END IF;
    IF NOT public._counter_allow('qr_scan', p_store) THEN RETURN; END IF;
    INSERT INTO public.store_qr_scans (store_id, day, table_no, scans)
    VALUES (p_store, (now() AT TIME ZONE 'America/Porto_Velho')::date, v_t, 1)
    ON CONFLICT (store_id, day, table_no) DO UPDATE SET scans = store_qr_scans.scans + 1;
END; $$;
REVOKE ALL ON FUNCTION public.record_qr_scan(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_qr_scan(uuid, int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_store_qr_stats(p_store uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today date := (now() AT TIME ZONE 'America/Porto_Velho')::date;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Só a dona da loja vê isto' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'today', COALESCE((SELECT sum(scans) FROM public.store_qr_scans WHERE store_id = p_store AND day = v_today), 0),
        'week', COALESCE((SELECT sum(scans) FROM public.store_qr_scans WHERE store_id = p_store AND day > v_today - 7), 0),
        'month', COALESCE((SELECT sum(scans) FROM public.store_qr_scans WHERE store_id = p_store AND day > v_today - 30), 0),
        'tables', COALESCE((SELECT jsonb_agg(x ORDER BY x.scans DESC) FROM (
            SELECT table_no, sum(scans)::int AS scans FROM public.store_qr_scans
             WHERE store_id = p_store AND day > v_today - 30 GROUP BY table_no ORDER BY sum(scans) DESC LIMIT 10) x), '[]'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.get_store_qr_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_qr_stats(uuid) TO authenticated;
