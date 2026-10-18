-- Etapa 2.7.1 (parte B2) — TRAVA DE COLUNAS em `profiles` e `stores`. Só roda depois que o app já usa as fontes da B1.
--
-- Antes: profiles (RLS desligado até o hotfix 20261103) e stores entregavam TODAS as colunas — Pix, e-mail, CPF/CNPJ,
-- telefone, endereço residencial, coordenadas, saldo, bot de WhatsApp, concessão de acesso — a qualquer pessoa,
-- inclusive sem login; e qualquer usuário logado podia escrever em colunas de privilégio no PRÓPRIO perfil
-- (is_admin, available_balance, level, status_id, is_blocked...).
-- Agora (privilégio mínimo, no banco — esconder na tela não protege):
--   * LEITURA: anon/authenticated só enxergam as colunas públicas (GRANT SELECT por coluna). O resto é do dono
--     (views my_profile / my_stores), de RPC com vínculo (telefone, Pix no pagamento V2) ou do servidor (service role).
--   * ESCRITA em profiles: só colunas que a tela realmente edita. is_admin, saldos, nível, bloqueio, status,
--     contadores e pix_key deixam de ser graváveis pelo navegador (funções SECURITY DEFINER e service role seguem).
--   * ESCRITA em stores: o dono edita a loja, mas não concessão de acesso, avaliações, contadores, dono nem a
--     conexão do bot (essa é do admin, via servidor). INSERT direto some: lojas nascem em create_store_with_access.

DO $$
DECLARE
    profile_public text[] := ARRAY[
        'id','name','profileSlug','avatar_url','upline_id','path','created_at','description','banner_url','bio','instagram',
        'calendar_url','theme_mode','background_mode','background_image_url','app_theme','font_size','is_seller','is_active',
        'ratings_avg','ratings_count','view_count','share_count','category','prep_time_min','prep_time_max','price_min',
        'price_max','working_hours','business_hours','accepts_delivery','accepts_pickup','accepts_pix','accepts_card',
        'accepts_cash','delivery_type','delivery_fee','delivery_distance_rules','delivery_fee_per_km','delivery_base_distance',
        'delivery_base_fee','allow_scheduling','level','downline_count','total_network','status_id','avatar_border_id',
        'chat_enabled','service_mode_active','show_location','show_on_map','show_in_social','live_location','public_address'];
    profile_writable text[] := ARRAY[
        'id','name','profileSlug','avatar_url','upline_id','email','cpf_cnpj','whatsapp','address','address_number',
        'address_complement','store_lat','store_lng','location','show_location','show_on_map','show_in_social','live_location',
        'description','banner_url','bio','instagram','calendar_url','theme_mode','background_mode','background_image_url',
        'app_theme','font_size','working_hours','business_hours','allow_scheduling','chat_enabled','service_mode_active',
        'updated_at'];
    store_public text[] := ARRAY[
        'id','name','storeSlug','description','logo_url','banner_url','owner_id','is_active','meta_title','meta_description',
        'ratings_avg','ratings_count','prep_time_min','prep_time_max','price_min','price_max','created_at','location',
        'calendar_url','address','business_hours','category','view_count','accepts_delivery','accepts_pickup','accepts_pix',
        'accepts_card','accepts_cash','store_address','store_lat','store_lng','delivery_type','delivery_fee',
        'delivery_distance_rules','delivery_fee_per_km','delivery_base_distance','delivery_base_fee','allow_scheduling',
        'address_number','address_complement','instagram','share_count','vip_club_enabled','vip_club_price',
        'vip_club_description','iuser_delivery_enabled','whatsapp_orders_enabled','show_whatsapp','scheduling_activated_at',
        'chat_enabled','mutual_reviews'];
    store_not_writable text[] := ARRAY[
        'id','owner_id','created_at','access_granted_at','access_expires_at','access_source','access_grant_id',
        'ratings_avg','ratings_count','view_count','share_count','whatsapp_bot_phone_number_id',
        'whatsapp_bot_display_number','whatsapp_bot_connected_at'];
    c text; cols text;
BEGIN
    -- todas as colunas citadas existem (erro cedo e claro se alguma sumiu)
    FOREACH c IN ARRAY profile_public || profile_writable LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name=c) THEN
            RAISE EXCEPTION 'coluna profiles.% não existe', c;
        END IF;
    END LOOP;
    FOREACH c IN ARRAY store_public || store_not_writable LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stores' AND column_name=c) THEN
            RAISE EXCEPTION 'coluna stores.% não existe', c;
        END IF;
    END LOOP;

    -- ---------------- profiles ----------------
    REVOKE SELECT, INSERT, UPDATE ON public.profiles FROM anon, authenticated;
    SELECT string_agg(quote_ident(x), ', ') INTO cols FROM unnest(profile_public) x;
    EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon, authenticated', cols);
    SELECT string_agg(quote_ident(x), ', ') INTO cols FROM unnest(profile_writable) x;
    EXECUTE format('GRANT INSERT (%s) ON public.profiles TO authenticated', cols);
    EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', cols);

    -- ---------------- stores ----------------
    REVOKE SELECT, INSERT, UPDATE ON public.stores FROM anon, authenticated;
    SELECT string_agg(quote_ident(x), ', ') INTO cols FROM unnest(store_public) x;
    EXECUTE format('GRANT SELECT (%s) ON public.stores TO anon, authenticated', cols);
    SELECT string_agg(quote_ident(a.attname), ', ') INTO cols
      FROM pg_attribute a
     WHERE a.attrelid = 'public.stores'::regclass AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attname <> ALL (store_not_writable);
    EXECUTE format('GRANT UPDATE (%s) ON public.stores TO authenticated', cols);
END $$;

-- ---------------------------------------------------------------------------------------------------------
-- Políticas de linha: uma por finalidade (antes: 8 de leitura iguais em stores, 3 de escrita repetidas)
-- ---------------------------------------------------------------------------------------------------------
-- profiles: leitura de linha é pública; o que cada papel enxerga é decidido pelas colunas liberadas acima.
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Permitir INSERT para usuários autenticados" ON public.profiles;
DROP POLICY IF EXISTS "Permitir UPDATE para próprio usuário" ON public.profiles;
DROP POLICY IF EXISTS profiles_select_public_columns ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_select_public_columns ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- stores
DROP POLICY IF EXISTS "Anyone can read stores" ON public.stores;
DROP POLICY IF EXISTS "Ler lojas publicamente" ON public.stores;
DROP POLICY IF EXISTS "Lojas visíveis para todos" ON public.stores;
DROP POLICY IF EXISTS "Lojas visíveis publicamente" ON public.stores;
DROP POLICY IF EXISTS "Stores are public" ON public.stores;
DROP POLICY IF EXISTS "Dono vê suas lojas" ON public.stores;
DROP POLICY IF EXISTS "Usuários veem suas próprias lojas" ON public.stores;
DROP POLICY IF EXISTS "Ver lojas públicas" ON public.stores;
DROP POLICY IF EXISTS publico_ve_lojas_ativas ON public.stores;
DROP POLICY IF EXISTS "Owners can delete their own stores" ON public.stores;
DROP POLICY IF EXISTS owner_deleta_loja ON public.stores;
DROP POLICY IF EXISTS "Owners can update their own stores" ON public.stores;
DROP POLICY IF EXISTS owner_atualiza_loja ON public.stores;
DROP POLICY IF EXISTS "Authenticated users can create stores" ON public.stores;
DROP POLICY IF EXISTS "Dono pode gerenciar sua loja" ON public.stores;
DROP POLICY IF EXISTS stores_select_public_columns ON public.stores;
DROP POLICY IF EXISTS stores_owner_write ON public.stores;
CREATE POLICY stores_select_public_columns ON public.stores FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY stores_owner_write ON public.stores FOR ALL TO authenticated
    USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------------------------------------
-- Realtime de stores: exatamente as colunas públicas (antes ainda levava o WhatsApp)
-- ---------------------------------------------------------------------------------------------------------
DO $$
DECLARE cols text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='stores') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.stores;
    END IF;
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO cols
      FROM pg_attribute a
     WHERE a.attrelid='public.stores'::regclass AND a.attnum>0 AND NOT a.attisdropped
       AND has_column_privilege('anon','public.stores',a.attname,'SELECT');
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.stores (%s)', cols);
END $$;

-- ---------------------------------------------------------------------------------------------------------
-- Ajustes das funções da B1 (regras finais)
-- ---------------------------------------------------------------------------------------------------------
-- WhatsApp da loja: o dono sempre; os outros só se a loja está ativa E marcou "mostrar WhatsApp".
CREATE OR REPLACE FUNCTION public.get_store_whatsapp(p_store uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_wa text; v_ok boolean;
BEGIN
    IF v_me IS NULL OR p_store IS NULL THEN RETURN NULL; END IF;
    SELECT COALESCE(NULLIF(btrim(s.whatsapp), ''), NULLIF(btrim(o.whatsapp), '')),
           (s.owner_id = v_me) OR (coalesce(s.is_active, true) AND s.show_whatsapp IS NOT FALSE)
      INTO v_wa, v_ok
    FROM public.stores s LEFT JOIN public.profiles o ON o.id = s.owner_id
    WHERE s.id = p_store;
    IF NOT coalesce(v_ok, false) THEN RETURN NULL; END IF;
    RETURN v_wa;
END $$;

-- Indicado padrão: o admin é achado pelo e-mail da CONTA (auth.users), não pela cópia editável em profiles.email
-- (senão qualquer um poderia gravar esse e-mail no próprio perfil e virar upline dos novos cadastros).
CREATE OR REPLACE FUNCTION public.get_default_upline_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
    SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE lower(u.email) = 'ncastelano@gmail.com' LIMIT 1
$$;

-- Cidade para título/SEO: "Porto Velho - RO", sem devolver o endereço; respeita "Mostrar no meu perfil".
CREATE OR REPLACE FUNCTION public.get_profile_city(p_slug text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT (SELECT m[1] || ' - ' || m[2] FROM regexp_match(p.address, ',\s*([^,]+?)\s-\s([^,]+?)(?:,|$)') m)
    FROM public.profiles p
    WHERE p."profileSlug" = p_slug AND p.show_location IS NOT FALSE
    LIMIT 1
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Defesa em profundidade: tabelas com dado sensível não precisam de NENHUM privilégio para `anon`
-- (o RLS já devolvia 0 linhas, mas o grant de coluna fazia o esquema "anunciar" Pix/CPF/token a quem não tem login).
-- ---------------------------------------------------------------------------------------------------------
REVOKE ALL ON public.employees, public.postpaid_identities, public.native_push_tokens, public.store_access_settings,
              public.admin_pix_keys, public.withdrawal_requests, public.free_trial_claims FROM anon;
-- só quem está logado cria loja (a função já recusa sem login); devolve a loja recém-criada ao próprio dono
REVOKE ALL ON FUNCTION public.create_store_with_access(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_with_access(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
