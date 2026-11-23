-- 20261130000106_store_checkins.sql — "ESTOU AQUI" (23/11/2026, decisão do dono): quem chega numa loja (bar, restaurante...) é
-- perguntado "Você está na <loja>?"; dizendo SIM, aparece na página da loja como "aqui agora" por até 3 horas. Serve para a loja
-- mostrar que está bombando.
-- Privacidade: só aparece quem DISSE sim (ninguém é marcado sozinho); só nome, @ e foto; a posição da pessoa nunca é guardada
-- (só a loja e a hora); a coordenada da loja continua privada (as funções só dizem "você está perto da loja X").
-- Tabela sem acesso do app: tudo por função. Rollback: supabase/rollbacks/store_checkins_rollback.sql

CREATE TABLE IF NOT EXISTS public.store_checkins (
    profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,   -- uma loja por vez por pessoa
    store_id   uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '3 hours'
);
CREATE INDEX IF NOT EXISTS store_checkins_store_idx ON public.store_checkins (store_id, expires_at);
ALTER TABLE public.store_checkins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_checkins FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.store_checkin_log (
    profile_id uuid NOT NULL, store_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_checkin_log_idx ON public.store_checkin_log (profile_id, created_at);
ALTER TABLE public.store_checkin_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_checkin_log FROM PUBLIC, anon, authenticated;

-- distância em metros (haversine)
CREATE OR REPLACE FUNCTION public._dist_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
    SELECT 2 * 6371000 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- A loja mais perto (até 120 m) para PERGUNTAR "você está aqui?"; null se nenhuma. Só logado.
CREATE OR REPLACE FUNCTION public.get_checkin_candidate(p_lat double precision, p_lng double precision)
RETURNS TABLE(store_id uuid, name text, store_slug text, logo_url text, already_here boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR p_lat IS NULL OR p_lng IS NULL OR abs(p_lat) > 90 OR abs(p_lng) > 180 THEN RETURN; END IF;
    RETURN QUERY
    SELECT s.id, s.name, s."storeSlug", s.logo_url,
           EXISTS (SELECT 1 FROM public.store_checkins c WHERE c.profile_id = auth.uid() AND c.store_id = s.id AND c.expires_at > now())
      FROM public.stores s
     WHERE s.is_active AND s.store_lat IS NOT NULL AND s.store_lng IS NOT NULL
       AND s.owner_id IS DISTINCT FROM auth.uid()
       AND s.store_lat BETWEEN p_lat - 0.002 AND p_lat + 0.002
       AND s.store_lng BETWEEN p_lng - 0.002 AND p_lng + 0.002
       AND public._dist_m(p_lat, p_lng, s.store_lat, s.store_lng) <= 120
     ORDER BY public._dist_m(p_lat, p_lng, s.store_lat, s.store_lng)
     LIMIT 1;
END $$;
REVOKE ALL ON FUNCTION public.get_checkin_candidate(double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkin_candidate(double precision, double precision) TO authenticated;

-- "Sim, estou aqui": confere que a pessoa está a até 150 m da loja; vale 3 h; troca a loja anterior; no máximo 20 por dia
CREATE OR REPLACE FUNCTION public.check_in_store(p_store uuid, p_lat double precision, p_lng double precision)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid(); s record;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501', HINT = 'login_required'; END IF;
    SELECT id, store_lat, store_lng, is_active, owner_id INTO s FROM public.stores WHERE id = p_store;
    IF NOT FOUND OR NOT s.is_active OR s.store_lat IS NULL THEN RAISE EXCEPTION 'Loja indisponível.' USING HINT = 'store_unavailable'; END IF;
    IF s.owner_id = v_me THEN RAISE EXCEPTION 'É a sua loja.' USING HINT = 'own_store'; END IF;
    IF p_lat IS NULL OR p_lng IS NULL OR public._dist_m(p_lat, p_lng, s.store_lat, s.store_lng) > 150 THEN
        RAISE EXCEPTION 'Você precisa estar na loja.' USING HINT = 'too_far';
    END IF;
    IF (SELECT count(*) FROM public.store_checkin_log WHERE profile_id = v_me AND created_at > now() - interval '1 day') >= 20 THEN
        RAISE EXCEPTION 'Muitas marcações hoje. Tente amanhã.' USING HINT = 'rate_limited';
    END IF;
    INSERT INTO public.store_checkins (profile_id, store_id, created_at, expires_at) VALUES (v_me, p_store, now(), now() + interval '3 hours')
    ON CONFLICT (profile_id) DO UPDATE SET store_id = EXCLUDED.store_id, created_at = now(), expires_at = now() + interval '3 hours';
    INSERT INTO public.store_checkin_log (profile_id, store_id) VALUES (v_me, p_store);
    RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.check_in_store(uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_store(uuid, double precision, double precision) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_out_store()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ DELETE FROM public.store_checkins WHERE profile_id = auth.uid() $$;
REVOKE ALL ON FUNCTION public.check_out_store() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_out_store() TO authenticated;

-- Quem está AQUI AGORA numa loja (público): quantos e até 12 pessoas (só nome, @ e foto); conta bloqueada/inativa não aparece
CREATE OR REPLACE FUNCTION public.get_store_here(p_store uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    WITH here AS (
        SELECT p.id, p.name, p."profileSlug" AS slug, p.avatar_url, c.created_at
          FROM public.store_checkins c JOIN public.profiles p ON p.id = c.profile_id
         WHERE c.store_id = p_store AND c.expires_at > now() AND p.is_active AND NOT COALESCE(p.is_blocked, false)
    )
    SELECT jsonb_build_object(
        'count', (SELECT count(*) FROM here),
        'me', EXISTS (SELECT 1 FROM here WHERE id = auth.uid()),
        'people', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'slug', slug, 'avatar', avatar_url) ORDER BY created_at DESC)
                              FROM (SELECT * FROM here ORDER BY created_at DESC LIMIT 12) x), '[]'::jsonb))
$$;
GRANT EXECUTE ON FUNCTION public.get_store_here(uuid) TO anon, authenticated;

-- limpeza: marcações vencidas e o registro com mais de 3 dias
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('store-checkins-purge') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'store-checkins-purge');
        PERFORM cron.schedule('store-checkins-purge', '17 * * * *',
            $c$DELETE FROM public.store_checkins WHERE expires_at < now(); DELETE FROM public.store_checkin_log WHERE created_at < now() - interval '3 days';$c$);
    END IF;
END $$;
