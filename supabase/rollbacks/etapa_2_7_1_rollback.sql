-- ROLLBACK da Etapa 2.7.1 (migrations 20261104 + 20261105): volta ao estado do hotfix 20261103 (RLS em profiles ligado,
-- sem escrita para anon). ATENÇÃO: reabre a leitura de TODAS as colunas de profiles/stores (Pix, e-mail, CPF, telefone,
-- endereço) para anon/authenticated e devolve a escrita em colunas de privilégio no próprio perfil. Use só para
-- diagnosticar uma regressão — corrija e reaplique a trava em seguida.
-- O código do app desta etapa continua funcionando depois do rollback (my_profile/my_stores só são removidas no fim:
-- se o código novo estiver no ar, rode antes um deploy do commit anterior, ou comente a seção "views/funções novas").
-- Rode com: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/rollbacks/etapa_2_7_1_rollback.sql
begin;

-- ---------------- B2: grants por coluna → grants de tabela como estavam (pós-hotfix) ----------------
REVOKE SELECT, INSERT, UPDATE ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
REVOKE SELECT, INSERT, UPDATE ON public.stores FROM anon, authenticated;
GRANT SELECT ON public.stores TO anon, authenticated;
GRANT INSERT, UPDATE ON public.stores TO authenticated;

-- políticas como estavam
DROP POLICY IF EXISTS profiles_select_public_columns ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT TO public USING (true);
CREATE POLICY "Permitir INSERT para usuários autenticados" ON public.profiles FOR INSERT TO public WITH CHECK (auth.uid() = id);
CREATE POLICY "Permitir UPDATE para próprio usuário" ON public.profiles FOR UPDATE TO public USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS stores_select_public_columns ON public.stores;
DROP POLICY IF EXISTS stores_owner_write ON public.stores;
CREATE POLICY "Anyone can read stores" ON public.stores FOR SELECT TO public USING (true);
CREATE POLICY "Ler lojas publicamente" ON public.stores FOR SELECT TO public USING (true);
CREATE POLICY "Lojas visíveis para todos" ON public.stores FOR SELECT TO public USING (true);
CREATE POLICY "Lojas visíveis publicamente" ON public.stores FOR SELECT TO public USING (true);
CREATE POLICY "Stores are public" ON public.stores FOR SELECT TO public USING (true);
CREATE POLICY "Usuários veem suas próprias lojas" ON public.stores FOR SELECT TO public USING (owner_id = auth.uid());
CREATE POLICY "Dono vê suas lojas" ON public.stores FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Ver lojas públicas" ON public.stores FOR SELECT TO authenticated USING (name <> 'Meus compromissos');
CREATE POLICY publico_ve_lojas_ativas ON public.stores FOR SELECT TO public USING (is_active = true);
CREATE POLICY "Dono pode gerenciar sua loja" ON public.stores FOR ALL TO public USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can delete their own stores" ON public.stores FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY owner_deleta_loja ON public.stores FOR DELETE TO public USING (owner_id = auth.uid());
CREATE POLICY "Owners can update their own stores" ON public.stores FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY owner_atualiza_loja ON public.stores FOR UPDATE TO public USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Authenticated users can create stores" ON public.stores FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

-- realtime de stores: lista do hotfix (colunas públicas + whatsapp)
DO $$
DECLARE cols text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='stores') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.stores;
    END IF;
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO cols
      FROM pg_attribute a
     WHERE a.attrelid='public.stores'::regclass AND a.attnum>0 AND NOT a.attisdropped
       AND a.attname NOT IN ('pix_key','pix_key_type','whatsapp_bot_opt_in','whatsapp_bot_phone_number_id','whatsapp_bot_display_number',
                             'whatsapp_bot_connected_at','whatsapp_bot_requested_number','whatsapp_bot_status',
                             'access_granted_at','access_expires_at','access_source','access_grant_id');
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.stores (%s)', cols);
END $$;

-- tabelas sensíveis: anon volta ao padrão do Supabase (o RLS continua devolvendo 0 linhas)
GRANT ALL ON public.employees, public.postpaid_identities, public.native_push_tokens, public.store_access_settings,
             public.admin_pix_keys, public.withdrawal_requests, public.free_trial_claims TO anon;
GRANT EXECUTE ON FUNCTION public.create_store_with_access(jsonb) TO anon;

-- ---------------- B1: funções/visões novas e funções substituídas ----------------
DROP FUNCTION IF EXISTS public.search_profiles_unaccented(text);
CREATE FUNCTION public.search_profiles_unaccented(search_term text) RETURNS SETOF public.profiles
LANGUAGE sql STABLE AS $f$
    select * from profiles where is_active = true and (
        public.unaccent(coalesce(name, '')) ilike public.unaccent('%' || search_term || '%')
        or public.unaccent(coalesce("profileSlug", '')) ilike public.unaccent('%' || search_term || '%')
        or public.unaccent(coalesce(description, '')) ilike public.unaccent('%' || search_term || '%')
        or public.unaccent(coalesce(bio, '')) ilike public.unaccent('%' || search_term || '%')
        or public.unaccent(coalesce(address, '')) ilike public.unaccent('%' || search_term || '%')
    ) limit 20
$f$;
GRANT EXECUTE ON FUNCTION public.search_profiles_unaccented(text) TO anon, authenticated;
DROP FUNCTION IF EXISTS public.search_stores_unaccented(text);
CREATE FUNCTION public.search_stores_unaccented(search_term text) RETURNS SETOF public.stores
LANGUAGE sql STABLE AS $f$
    select * from stores where (
        public.unaccent(coalesce(name, '')) ilike public.unaccent('%' || search_term || '%')
        or public.unaccent(coalesce(description, '')) ilike public.unaccent('%' || search_term || '%')
        or public.unaccent(coalesce("storeSlug", '')) ilike public.unaccent('%' || search_term || '%')
        or public.unaccent(coalesce(category, '')) ilike public.unaccent('%' || search_term || '%')
    ) limit 30
$f$;
GRANT EXECUTE ON FUNCTION public.search_stores_unaccented(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_driver_recent_rides(uuid, integer);
CREATE FUNCTION public.get_driver_recent_rides(p_driver uuid, p_limit integer DEFAULT 6)
RETURNS TABLE(ride_id uuid, rode_at timestamptz, distance_km numeric, origin_address text, destination_address text,
              rating integer, comment text, reviewer_name text, reviewer_slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
    SELECT r.id, COALESCE(r.ride_started_at, r.created_at), r.distance_km, r.origin_address, r.destination_address,
           rv.rating, NULLIF(btrim(rv.comment), ''), p.name, p."profileSlug"
    FROM public.ride_requests r
    LEFT JOIN public.ride_reviews rv ON rv.ride_request_id = r.id AND rv.reviewee_id = p_driver
    LEFT JOIN public.profiles p ON p.id = rv.reviewer_id
    WHERE r.driver_id = p_driver AND r.status = 'completed'
    ORDER BY COALESCE(r.ride_started_at, r.created_at) DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 20))
$f$;
REVOKE ALL ON FUNCTION public.get_driver_recent_rides(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_recent_rides(uuid, integer) TO anon, authenticated;

-- funções mortas revogadas na B1: voltam como estavam (anon/authenticated)
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace
               AND p.proname IN ('get_employee_deliveries', 'get_tracking_info', 'get_downline_with_commissions', 'update_profile_rating')
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.sig);
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.get_profile_whatsapp(uuid);
DROP FUNCTION IF EXISTS public.get_store_whatsapp(uuid);
DROP FUNCTION IF EXISTS public.get_store_order_whatsapp(uuid);
DROP FUNCTION IF EXISTS public.get_default_upline_id();
DROP FUNCTION IF EXISTS public.get_ride_applicant_locations(uuid);
DROP FUNCTION IF EXISTS public.get_profile_city(text);
DROP VIEW IF EXISTS public.my_profile;
DROP VIEW IF EXISTS public.my_stores;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS public_address;
DROP FUNCTION IF EXISTS public._coarse_address(text);

NOTIFY pgrst, 'reload schema';
commit;
