-- Etapa 2.7.1 (parte B1) — FONTES SEGURAS SUBSTITUTAS. Aditiva: nada é revogado aqui.
--
-- Motivo: `profiles` e `stores` entregavam TODAS as colunas (Pix, e-mail, CPF, telefone, endereço residencial,
-- coordenadas, saldo...) a qualquer pessoa, inclusive sem login. Antes de travar as colunas (parte B2),
-- criamos o que as telas legítimas vão usar no lugar:
--   * my_profile / my_stores ........ o dono lê a PRÓPRIA linha completa (filtro por auth.uid(), só `authenticated`)
--   * profiles.public_address ....... endereço grosseiro (bairro), só se a pessoa mostra a localização no perfil
--   * get_profile_whatsapp / get_store_whatsapp / get_store_order_whatsapp ... telefone só com login e vínculo
--   * get_default_upline_id ......... cadastro sem expor o e-mail do admin como filtro
--   * get_ride_applicant_locations .. posição aproximada (~1 km) dos candidatos à MINHA corrida
--   * get_profile_city .............. cidade pro título/SEO da página pública
--   * search_*_unaccented ........... deixam de devolver a linha inteira (SETOF profiles/stores)

-- ---------------------------------------------------------------------------------------------------------
-- 1. Endereço grosseiro público (bairro), controlado pelo "Mostrar no meu perfil" (show_location)
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._coarse_address(a text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
    WITH parts AS (
        SELECT btrim(x) AS p, ord
        FROM unnest(string_to_array(coalesce(a, ''), ',')) WITH ORDINALITY AS t(x, ord)
        WHERE btrim(x) <> '' AND btrim(x) !~ '^[0-9]+([-[:space:]][0-9]+)?$'
    ), arr AS (SELECT array_agg(p ORDER BY ord) AS v FROM parts)
    SELECT CASE
        WHEN v IS NULL THEN NULL
        WHEN array_length(v, 1) >= 3 THEN v[2]
        ELSE NULLIF(btrim(regexp_replace(regexp_replace(v[1], '[0-9]+', '', 'g'), '[[:space:]]+', ' ', 'g')), '')
    END FROM arr
$$;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS public_address text
    GENERATED ALWAYS AS (CASE WHEN show_location IS NOT FALSE THEN public._coarse_address(address) END) STORED;

COMMENT ON COLUMN public.profiles.public_address IS
    'Endereço grosseiro (só o bairro) para exibição pública. O endereço completo (address, address_number, address_complement, store_lat/lng, location) é privado do dono.';

-- ---------------------------------------------------------------------------------------------------------
-- 2. O dono lê a própria linha completa
-- ---------------------------------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.my_profile;
CREATE VIEW public.my_profile WITH (security_barrier = true) AS
    SELECT p.* FROM public.profiles p WHERE p.id = auth.uid();
REVOKE ALL ON public.my_profile FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.my_profile TO authenticated;
COMMENT ON VIEW public.my_profile IS 'Linha COMPLETA do próprio perfil (inclui colunas privadas). Só authenticated; filtra por auth.uid().';

DROP VIEW IF EXISTS public.my_stores;
CREATE VIEW public.my_stores WITH (security_barrier = true) AS
    SELECT s.* FROM public.stores s WHERE s.owner_id = auth.uid();
REVOKE ALL ON public.my_stores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.my_stores TO authenticated;
COMMENT ON VIEW public.my_stores IS 'Lojas do próprio dono com TODAS as colunas (Pix, WhatsApp, bot, acesso). Só authenticated; filtra por auth.uid().';

-- ---------------------------------------------------------------------------------------------------------
-- 3. Telefone (WhatsApp): só com login e com motivo
-- ---------------------------------------------------------------------------------------------------------
-- Perfil: o próprio dono, ou perfil que oferece algo (vendedor, prestador, loja, anúncio) ou parte de um serviço
-- combinado com quem pergunta. Perfil pessoal que não oferece nada continua sem número visível.
CREATE OR REPLACE FUNCTION public.get_profile_whatsapp(p_profile uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_wa text; v_ok boolean;
BEGIN
    IF v_me IS NULL OR p_profile IS NULL THEN RETURN NULL; END IF;
    SELECT p.whatsapp,
           (p.id = v_me)
           OR (coalesce(p.is_active, true) AND (
                coalesce(p.is_seller, false) OR coalesce(p.service_mode_active, false)
                OR EXISTS (SELECT 1 FROM public.stores s WHERE s.owner_id = p.id)
                OR EXISTS (SELECT 1 FROM public.products pr WHERE pr.owner_id = p.id AND coalesce(pr.is_active, true))
           ))
           OR EXISTS (
                SELECT 1 FROM public.service_applications sa
                JOIN public.service_requests sr ON sr.id = sa.service_request_id
                WHERE (sa.applicant_id = v_me AND sr.requester_id = p.id)
                   OR (sa.applicant_id = p.id AND sr.requester_id = v_me)
           )
      INTO v_wa, v_ok
    FROM public.profiles p WHERE p.id = p_profile;
    IF NOT coalesce(v_ok, false) THEN RETURN NULL; END IF;
    RETURN NULLIF(btrim(v_wa), '');
END $$;

-- Loja: contato comercial da loja ativa (ou o do dono, como a tela já fazia); só com login.
CREATE OR REPLACE FUNCTION public.get_store_whatsapp(p_store uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_wa text; v_ok boolean;
BEGIN
    IF v_me IS NULL OR p_store IS NULL THEN RETURN NULL; END IF;
    SELECT COALESCE(NULLIF(btrim(s.whatsapp), ''), NULLIF(btrim(o.whatsapp), '')),
           (s.owner_id = v_me) OR coalesce(s.is_active, true)
      INTO v_wa, v_ok
    FROM public.stores s LEFT JOIN public.profiles o ON o.id = s.owner_id
    WHERE s.id = p_store;
    IF NOT coalesce(v_ok, false) THEN RETURN NULL; END IF;
    RETURN v_wa;
END $$;

-- Pedido recém-feito pelo cliente: abre o WhatsApp da loja. Exige pedido do chamador naquela loja.
CREATE OR REPLACE FUNCTION public.get_store_order_whatsapp(p_store uuid)
RETURNS TABLE(whatsapp text, orders_enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
    IF v_me IS NULL OR p_store IS NULL THEN RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.store_id = p_store AND o.buyer_id = v_me) THEN RETURN; END IF;
    RETURN QUERY
        SELECT COALESCE(NULLIF(btrim(s.whatsapp), ''), NULLIF(btrim(o.whatsapp), '')),
               s.whatsapp_orders_enabled IS DISTINCT FROM false
        FROM public.stores s LEFT JOIN public.profiles o ON o.id = s.owner_id
        WHERE s.id = p_store;
END $$;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Cadastro: indicado padrão do admin sem filtrar profiles por e-mail; CPF/CNPJ vai por rota do servidor
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_default_upline_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT id FROM public.profiles WHERE email = 'ncastelano@gmail.com' LIMIT 1
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 5. Corrida: posição APROXIMADA (arredondada a ~1 km) de quem se candidatou à MINHA corrida
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ride_applicant_locations(p_ride uuid)
RETURNS TABLE(profile_id uuid, lat double precision, lng double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
    IF v_me IS NULL THEN RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.id = p_ride AND r.requester_id = v_me) THEN RETURN; END IF;
    RETURN QUERY
        SELECT p.id, round(p.store_lat::numeric, 2)::double precision, round(p.store_lng::numeric, 2)::double precision
        FROM public.profiles p
        WHERE p.store_lat IS NOT NULL AND p.store_lng IS NOT NULL
          AND (p.id IN (SELECT a.applicant_id FROM public.ride_applications a WHERE a.ride_request_id = p_ride)
               OR p.id IN (SELECT r.driver_id FROM public.ride_requests r WHERE r.id = p_ride AND r.driver_id IS NOT NULL));
END $$;

-- ---------------------------------------------------------------------------------------------------------
-- 6. Cidade pública (título/SEO da página do perfil), sem devolver o endereço
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_profile_city(p_slug text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT public_address FROM public.profiles WHERE "profileSlug" = p_slug LIMIT 1
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 7. Buscas deixam de devolver a linha inteira (SETOF profiles / SETOF stores)
-- ---------------------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_profiles_unaccented(text);
CREATE FUNCTION public.search_profiles_unaccented(search_term text)
RETURNS TABLE(id uuid, name text, "profileSlug" text, avatar_url text, description text, bio text,
              ratings_avg numeric, ratings_count integer, view_count integer, is_seller boolean, category text,
              created_at timestamptz, public_address text)
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT p.id, p.name, p."profileSlug", p.avatar_url, p.description, p.bio,
           p.ratings_avg, p.ratings_count, p.view_count, p.is_seller, p.category, p.created_at, p.public_address
    FROM public.profiles p
    WHERE p.is_active = true AND (
        public.unaccent(coalesce(p.name, '')) ILIKE public.unaccent('%' || search_term || '%')
        OR public.unaccent(coalesce(p."profileSlug", '')) ILIKE public.unaccent('%' || search_term || '%')
        OR public.unaccent(coalesce(p.description, '')) ILIKE public.unaccent('%' || search_term || '%')
        OR public.unaccent(coalesce(p.bio, '')) ILIKE public.unaccent('%' || search_term || '%')
        OR public.unaccent(coalesce(p.public_address, '')) ILIKE public.unaccent('%' || search_term || '%')
    ) LIMIT 20
$$;
GRANT EXECUTE ON FUNCTION public.search_profiles_unaccented(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.search_stores_unaccented(text);
CREATE FUNCTION public.search_stores_unaccented(search_term text)
RETURNS TABLE(id uuid, name text, "storeSlug" text)
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT s.id, s.name, s."storeSlug"
    FROM public.stores s
    WHERE public.unaccent(coalesce(s.name, '')) ILIKE public.unaccent('%' || search_term || '%')
       OR public.unaccent(coalesce(s.description, '')) ILIKE public.unaccent('%' || search_term || '%')
       OR public.unaccent(coalesce(s."storeSlug", '')) ILIKE public.unaccent('%' || search_term || '%')
       OR public.unaccent(coalesce(s.category, '')) ILIKE public.unaccent('%' || search_term || '%')
    LIMIT 30
$$;
GRANT EXECUTE ON FUNCTION public.search_stores_unaccented(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 8. Trajeto público do motorista: endereço grosseiro NO BANCO (antes a tela é que "escondia" o resto)
-- ---------------------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_driver_recent_rides(uuid, integer);
CREATE FUNCTION public.get_driver_recent_rides(p_driver uuid, p_limit integer DEFAULT 6)
RETURNS TABLE(ride_id uuid, rode_at timestamptz, distance_km numeric, origin_address text, destination_address text,
              rating integer, comment text, reviewer_name text, reviewer_slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT r.id,
           COALESCE(r.ride_started_at, r.created_at),
           r.distance_km,
           COALESCE(public._coarse_address(r.origin_address), 'um local'),
           COALESCE(public._coarse_address(r.destination_address), 'um local'),
           rv.rating,
           NULLIF(btrim(rv.comment), ''),
           p.name,
           p."profileSlug"
    FROM public.ride_requests r
    LEFT JOIN public.ride_reviews rv ON rv.ride_request_id = r.id AND rv.reviewee_id = p_driver
    LEFT JOIN public.profiles p ON p.id = rv.reviewer_id
    WHERE r.driver_id = p_driver AND r.status = 'completed'
    ORDER BY COALESCE(r.ride_started_at, r.created_at) DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 20))
$$;
REVOKE ALL ON FUNCTION public.get_driver_recent_rides(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_recent_rides(uuid, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 9. Funções mortas/inseguras alcançáveis por anon (nenhum código do app as chama)
-- ---------------------------------------------------------------------------------------------------------
--   get_employee_deliveries: "token" é md5(id || segredo escrito no código da função) e lê tabela que nem existe mais;
--   get_tracking_info: lê tabela inexistente (delivery_tracking);
--   get_downline_with_commissions: invoker, sem dono, usada por ninguém.
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace
               AND p.proname IN ('get_employee_deliveries', 'get_tracking_info', 'get_downline_with_commissions', 'update_profile_rating')
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END LOOP;
END $$;

-- funções novas: só quem deve chamar
REVOKE ALL ON FUNCTION public.get_profile_whatsapp(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_store_whatsapp(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_store_order_whatsapp(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ride_applicant_locations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_whatsapp(uuid), public.get_store_whatsapp(uuid),
    public.get_store_order_whatsapp(uuid), public.get_ride_applicant_locations(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_default_upline_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_default_upline_id() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_profile_city(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_city(text) TO anon, authenticated;
