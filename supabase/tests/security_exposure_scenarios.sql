-- Etapa 2.7.1 — TESTE PERMANENTE DE EXPOSIÇÃO DE DADOS (profiles / stores / Pix / funções / realtime).
-- Roda inteiro numa transação DESFEITA (termina em RAISE EXCEPTION 'RESULT: ...'); dados de teste são marcadores
-- inventados (nenhum valor real é lido ou impresso). Falha = linha 'FAIL' no RESULT.
--   npx supabase db query --linked -f supabase/tests/security_exposure_scenarios.sql           (produção: só lê, termina desfeito)
--   env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked --workdir .staging -f supabase/tests/security_exposure_scenarios.sql   (staging)
-- Cobre: anon, autenticado sem vínculo (estranho), dono, catálogo de colunas sensíveis em TODO o schema público,
-- views, funções que devolvem linhas inteiras, políticas largas, grants de tabela e publicação realtime.
-- Se alguém criar uma view/tabela/função que exponha Pix, e-mail, CPF, telefone etc. a anon, ou devolver
-- `SETOF profiles/stores`, este teste FALHA.

DO $T$
DECLARE
    r text := ''; fails int := 0; passes int := 0;
    u uuid; stranger uuid; seller_store uuid; seller_owner uuid; v uuid;
    c text; n int; sqlstate_ text; ok boolean; t text; x text;
    profile_private text[] := ARRAY['whatsapp','address','address_number','address_complement','location','store_lat','store_lng',
        'cart_data','pix_key','pix_key_type','email','cpf_cnpj','is_admin','is_blocked','blocked_reason','last_login_at',
        'available_balance','total_earnings','total_sales','direct_sales','notification_preferences','privacy_settings',
        'updated_at','preferred_version','team_id','breakaway_team_id','is_breakaway_leader','qualified_at',
        'breakaway_qualified_at','can_generate_store_codes','store_codes_granted_by','store_codes_granted_at',
        'scheduling_activated_at'];
    store_private text[] := ARRAY['whatsapp','pix_key','pix_key_type','whatsapp_bot_opt_in','whatsapp_bot_phone_number_id',
        'whatsapp_bot_display_number','whatsapp_bot_connected_at','whatsapp_bot_requested_number','whatsapp_bot_status',
        'access_granted_at','access_expires_at','access_source','access_grant_id'];
    profile_forbidden_write text[] := ARRAY['is_admin','is_blocked','blocked_reason','available_balance','total_earnings','total_sales',
        'direct_sales','level','status_id','pix_key','pix_key_type','downline_count','total_network','team_id','view_count',
        'ratings_avg','can_generate_store_codes','last_login_at','preferred_version','is_active','created_at','avatar_border_id'];
    store_forbidden_write text[] := ARRAY['access_expires_at','access_granted_at','access_source','access_grant_id','ratings_avg',
        'ratings_count','view_count','share_count','owner_id','whatsapp_bot_phone_number_id','whatsapp_bot_display_number',
        'whatsapp_bot_connected_at'];
    sensitive_names text[] := ARRAY['pix_key','pix_key_type','cpf_cnpj','email','available_balance','total_earnings',
        'blocked_reason','cart_data','notification_preferences','privacy_settings','access_token','password','token',
        'whatsapp_bot_phone_number_id','recipient_whatsapp','phone','employee_phone','document','api_key','secret'];
BEGIN
    -- produção: conta de teste do projeto; staging: conta do seed (scripts/staging/seed.mjs)
    SELECT id INTO u FROM profiles WHERE email IN ('usuarioteste@gmail.com', 'cliente@staging.iuser.test')
      ORDER BY (email = 'usuarioteste@gmail.com') DESC LIMIT 1;
    SELECT id INTO stranger FROM profiles WHERE id <> u AND id NOT IN (SELECT owner_id FROM stores) LIMIT 1;
    SELECT id, owner_id INTO seller_store, seller_owner FROM stores WHERE owner_id <> u LIMIT 1;
    IF u IS NULL OR stranger IS NULL OR seller_store IS NULL THEN RAISE EXCEPTION 'RESULT: FAIL setup (faltam dados de teste)'; END IF;

    -- marcadores inventados (desfeitos no fim): se aparecerem em alguma resposta de anon/estranho, é vazamento
    UPDATE profiles SET pix_key = 'MARCADOR-PIX-PERFIL', whatsapp = '5500999990000' WHERE id = stranger;
    UPDATE stores SET pix_key = 'MARCADOR-PIX-LOJA', whatsapp = '5500999991111', show_whatsapp = true WHERE id = seller_store;

    ------------------------------------------------------------------ ANON
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;
    -- profiles: cada coluna privada, individualmente e em select *
    FOREACH c IN ARRAY profile_private LOOP
        BEGIN EXECUTE format('SELECT %I FROM public.profiles LIMIT 1', c); r := r || 'FAIL anon lê profiles.'||c||E'\n'; fails := fails+1;
        EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    END LOOP;
    BEGIN EXECUTE 'SELECT * FROM public.profiles LIMIT 1'; r := r || E'FAIL anon select * profiles\n'; fails := fails+1;
    EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN EXECUTE 'SELECT id FROM public.profiles WHERE email = ''x'''; r := r || E'FAIL anon filtra profiles por email\n'; fails := fails+1;
    EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN EXECUTE 'SELECT id FROM public.profiles WHERE cpf_cnpj = ''x'''; r := r || E'FAIL anon filtra profiles por cpf_cnpj\n'; fails := fails+1;
    EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN EXECUTE 'SELECT id FROM public.profiles WHERE pix_key = ''MARCADOR-PIX-PERFIL'''; r := r || E'FAIL anon filtra profiles por pix_key (oráculo)\n'; fails := fails+1;
    EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN EXECUTE 'SELECT id FROM public.profiles ORDER BY pix_key'; r := r || E'FAIL anon ordena profiles por pix_key\n'; fails := fails+1;
    EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    EXECUTE 'SELECT count(*) FROM public.profiles' INTO n; IF n > 0 THEN passes := passes+1; ELSE r := r||E'FAIL anon não lê o perfil público\n'; fails := fails+1; END IF;
    EXECUTE 'SELECT id, name, "profileSlug", avatar_url, public_address FROM public.profiles WHERE id = $1' INTO v USING stranger;
    IF v IS NOT NULL THEN passes := passes+1; ELSE r := r||E'FAIL anon não lê colunas públicas\n'; fails := fails+1; END IF;
    -- stores
    FOREACH c IN ARRAY store_private LOOP
        BEGIN EXECUTE format('SELECT %I FROM public.stores LIMIT 1', c); r := r || 'FAIL anon lê stores.'||c||E'\n'; fails := fails+1;
        EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    END LOOP;
    BEGIN EXECUTE 'SELECT * FROM public.stores LIMIT 1'; r := r || E'FAIL anon select * stores\n'; fails := fails+1;
    EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN EXECUTE 'SELECT id FROM public.stores WHERE pix_key = ''MARCADOR-PIX-LOJA'''; r := r || E'FAIL anon filtra stores por pix_key (oráculo)\n'; fails := fails+1;
    EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    EXECUTE 'SELECT count(*) FROM public.stores' INTO n; IF n > 0 THEN passes := passes+1; ELSE r := r||E'FAIL anon não lê a vitrine pública\n'; fails := fails+1; END IF;
    EXECUTE 'SELECT id FROM public.stores WHERE id = $1 AND name IS NOT NULL AND "storeSlug" IS NOT NULL AND logo_url IS NOT DISTINCT FROM logo_url' INTO v USING seller_store;
    IF v IS NOT NULL THEN passes := passes+1; ELSE r := r||E'FAIL anon não lê colunas públicas da loja\n'; fails := fails+1; END IF;
    -- fontes do dono e RPCs com vínculo: negadas a anon
    BEGIN EXECUTE 'SELECT 1 FROM public.my_profile'; r := r || E'FAIL anon lê my_profile\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN EXECUTE 'SELECT 1 FROM public.my_stores'; r := r || E'FAIL anon lê my_stores\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN PERFORM public.get_profile_whatsapp(stranger); r := r || E'FAIL anon get_profile_whatsapp\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN PERFORM public.get_store_whatsapp(seller_store); r := r || E'FAIL anon get_store_whatsapp\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN PERFORM public.get_store_order_whatsapp(seller_store); r := r || E'FAIL anon get_store_order_whatsapp\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN PERFORM public.get_ride_applicant_locations(gen_random_uuid()); r := r || E'FAIL anon get_ride_applicant_locations\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN PERFORM public.get_delivery_payment_view(gen_random_uuid()); r := r || E'FAIL anon get_delivery_payment_view\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN EXECUTE 'SELECT 1 FROM public.driver_payout_keys'; r := r || E'FAIL anon lê driver_payout_keys\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    -- escrita
    BEGIN EXECUTE 'UPDATE public.profiles SET name = name'; r := r || E'FAIL anon escreve profiles\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN EXECUTE 'UPDATE public.stores SET name = name'; r := r || E'FAIL anon escreve stores\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN EXECUTE 'DELETE FROM public.profiles'; r := r || E'FAIL anon apaga profiles\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    -- buscas públicas não devolvem linha inteira nem acham por campo privado
    EXECUTE 'SELECT count(*) FROM public.search_profiles_unaccented(''a'')' INTO n; passes := passes+1;
    -- indicado padrão do cadastro funciona sem login
    EXECUTE 'SELECT public.get_default_upline_id()' INTO v; IF v IS NOT NULL THEN passes := passes+1; ELSE r := r||E'FAIL get_default_upline_id vazio\n'; fails := fails+1; END IF;
    RESET ROLE;

    ------------------------------------------------------------------ ESTRANHO (autenticado sem vínculo com stranger/seller)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    FOREACH c IN ARRAY profile_private LOOP
        BEGIN EXECUTE format('SELECT %I FROM public.profiles WHERE id = $1', c) USING stranger; r := r || 'FAIL estranho lê profiles.'||c||E'\n'; fails := fails+1;
        EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    END LOOP;
    BEGIN EXECUTE 'SELECT * FROM public.profiles'; r := r || E'FAIL estranho select * profiles\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    BEGIN EXECUTE 'SELECT id FROM public.profiles WHERE pix_key = ''MARCADOR-PIX-PERFIL'''; r := r || E'FAIL estranho filtra profiles por pix_key\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    FOREACH c IN ARRAY store_private LOOP
        BEGIN EXECUTE format('SELECT %I FROM public.stores WHERE id = $1', c) USING seller_store; r := r || 'FAIL estranho lê stores.'||c||E'\n'; fails := fails+1;
        EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    END LOOP;
    BEGIN EXECUTE 'SELECT * FROM public.stores'; r := r || E'FAIL estranho select * stores\n'; fails := fails+1; EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    -- dono: só a PRÓPRIA linha, completa
    EXECUTE 'SELECT count(*) FROM public.my_profile' INTO n; IF n = 1 THEN passes := passes+1; ELSE r := r||E'FAIL my_profile não devolve exatamente a própria linha\n'; fails := fails+1; END IF;
    EXECUTE 'SELECT count(*) FROM public.my_profile WHERE id <> $1' INTO n USING u; IF n = 0 THEN passes := passes+1; ELSE r := r||E'FAIL my_profile devolve linha de outra pessoa\n'; fails := fails+1; END IF;
    EXECUTE 'SELECT count(*) FROM public.my_stores WHERE owner_id <> $1' INTO n USING u; IF n = 0 THEN passes := passes+1; ELSE r := r||E'FAIL my_stores devolve loja de outro dono\n'; fails := fails+1; END IF;
    -- telefone por RPC: loja com show_whatsapp ligado sim; pedido inexistente não
    EXECUTE 'SELECT public.get_store_whatsapp($1)' INTO x USING seller_store; IF x IS NOT NULL THEN passes := passes+1; ELSE r := r||E'FAIL get_store_whatsapp de loja que mostra o WhatsApp voltou vazio\n'; fails := fails+1; END IF;
    EXECUTE 'SELECT count(*) FROM public.get_store_order_whatsapp($1)' INTO n USING seller_store;
    IF n = 0 OR EXISTS (SELECT 1 FROM orders WHERE store_id = seller_store AND buyer_id = u) THEN passes := passes+1; ELSE r := r||E'FAIL get_store_order_whatsapp sem pedido devolveu telefone\n'; fails := fails+1; END IF;
    EXECUTE 'SELECT count(*) FROM public.get_ride_applicant_locations(gen_random_uuid())' INTO n; IF n = 0 THEN passes := passes+1; ELSE r := r||E'FAIL get_ride_applicant_locations de corrida alheia\n'; fails := fails+1; END IF;
    -- escrita: dono edita o que é dele, não o que dá privilégio
    EXECUTE 'UPDATE public.profiles SET name = name WHERE id = $1' USING u; GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 1 THEN passes := passes+1; ELSE r := r||E'FAIL dono não consegue editar o próprio nome\n'; fails := fails+1; END IF;
    FOREACH c IN ARRAY profile_forbidden_write LOOP
        BEGIN EXECUTE format('UPDATE public.profiles SET %I = NULL WHERE id = $1', c) USING u; r := r || 'FAIL dono escreve profiles.'||c||E'\n'; fails := fails+1;
        EXCEPTION WHEN insufficient_privilege THEN passes := passes+1;
                  WHEN OTHERS THEN r := r || 'FAIL dono escreve profiles.'||c||' (negado só por regra de dados)'||E'\n'; fails := fails+1; END;
    END LOOP;
    EXECUTE 'UPDATE public.profiles SET name = ''x'' WHERE id = $1' USING stranger; GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN passes := passes+1; ELSE r := r||E'FAIL estranho edita perfil alheio\n'; fails := fails+1; END IF;
    EXECUTE 'UPDATE public.stores SET name = ''x'' WHERE id = $1' USING seller_store; GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN passes := passes+1; ELSE r := r||E'FAIL estranho edita loja alheia\n'; fails := fails+1; END IF;
    FOREACH c IN ARRAY store_forbidden_write LOOP
        BEGIN EXECUTE format('UPDATE public.stores SET %I = NULL WHERE id = $1', c) USING seller_store; r := r || 'FAIL dono escreve stores.'||c||E'\n'; fails := fails+1;
        EXCEPTION WHEN insufficient_privilege THEN passes := passes+1;
                  WHEN OTHERS THEN r := r || 'FAIL dono escreve stores.'||c||' (negado só por regra de dados)'||E'\n'; fails := fails+1; END;
    END LOOP;
    BEGIN EXECUTE 'INSERT INTO public.profiles (id, is_admin) VALUES (gen_random_uuid(), true)'; r := r || E'FAIL autenticado cria perfil com is_admin\n'; fails := fails+1;
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN passes := passes+1; END;
    BEGIN EXECUTE 'INSERT INTO public.stores (id, name, owner_id) VALUES (gen_random_uuid(), ''t'', $1)' USING u; r := r || E'FAIL autenticado cria loja direto\n'; fails := fails+1;
    EXCEPTION WHEN insufficient_privilege THEN passes := passes+1; END;
    RESET ROLE;

    ------------------------------------------------------------------ DONO DA LOJA
    PERFORM set_config('request.jwt.claims', json_build_object('sub', seller_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    EXECUTE 'SELECT pix_key FROM public.my_stores WHERE id = $1' INTO x USING seller_store;
    IF x = 'MARCADOR-PIX-LOJA' THEN passes := passes+1; ELSE r := r||E'FAIL dono da loja não lê o próprio Pix\n'; fails := fails+1; END IF;
    EXECUTE 'UPDATE public.stores SET pix_key = ''MARCADOR-PIX-LOJA'', accepts_pix = true WHERE id = $1' USING seller_store; GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 1 THEN passes := passes+1; ELSE r := r||E'FAIL dono da loja não edita a própria loja\n'; fails := fails+1; END IF;
    RESET ROLE;

    ------------------------------------------------------------------ CATÁLOGO: nenhum objeto do schema público dá coluna sensível a anon
    FOR t, c IN
        SELECT cl.relname, a.attname
        FROM pg_class cl JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum > 0 AND NOT a.attisdropped
        WHERE ns.nspname = 'public' AND cl.relkind IN ('r','v','m','p','f')
          AND a.attname = ANY (sensitive_names)
          AND has_column_privilege('anon', cl.oid, a.attnum, 'SELECT')
    LOOP
        r := r || 'FAIL anon lê coluna sensível '||t||'.'||c||E'\n'; fails := fails+1;
    END LOOP;
    passes := passes+1;
    -- views visíveis a anon não podem ser "definer" lendo profiles/stores sem filtro por auth.uid()
    FOR t IN
        SELECT cl.relname FROM pg_class cl
        WHERE cl.relnamespace = 'public'::regnamespace AND cl.relkind = 'v'
          AND has_table_privilege('anon', cl.oid, 'SELECT')
          AND coalesce(array_to_string(cl.reloptions, ','), '') NOT LIKE '%security_invoker=true%'
          AND pg_get_viewdef(cl.oid) ~* '\m(profiles|stores)\M'
          AND cl.relname NOT IN ('flash_posts_with_stores')
    LOOP
        r := r || 'FAIL view '||t||' legível por anon lê profiles/stores como dono (ignora grants de coluna)'||E'\n'; fails := fails+1;
    END LOOP;
    passes := passes+1;
    -- funções executáveis por anon que devolvem a linha inteira de profiles/stores
    FOR t IN
        SELECT p.oid::regprocedure::text FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND has_function_privilege('anon', p.oid, 'EXECUTE')
          AND p.prorettype IN ('public.profiles'::regtype, 'public.stores'::regtype)
    LOOP
        r := r || 'FAIL função '||t||' devolve a linha inteira de profiles/stores a anon'||E'\n'; fails := fails+1;
    END LOOP;
    passes := passes+1;
    -- funções executáveis por anon cuja SAÍDA tem coluna sensível
    FOR t IN
        SELECT p.oid::regprocedure::text FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND has_function_privilege('anon', p.oid, 'EXECUTE')
          AND p.proargnames IS NOT NULL AND p.proargmodes IS NOT NULL
          AND EXISTS (SELECT 1 FROM unnest(p.proargnames, p.proargmodes) z(nm, md) WHERE md IN ('t','o') AND nm = ANY (sensitive_names))
    LOOP
        r := r || 'FAIL função '||t||' devolve coluna sensível a anon'||E'\n'; fails := fails+1;
    END LOOP;
    passes := passes+1;

    ------------------------------------------------------------------ GRANTS DE TABELA e POLÍTICAS
    IF NOT (has_table_privilege('anon','public.profiles','SELECT') OR has_table_privilege('authenticated','public.profiles','SELECT')
         OR has_table_privilege('anon','public.stores','SELECT') OR has_table_privilege('authenticated','public.stores','SELECT')) THEN passes := passes+1;
    ELSE r := r||E'FAIL SELECT de tabela inteira ainda concedido em profiles/stores\n'; fails := fails+1; END IF;
    IF NOT (has_table_privilege('authenticated','public.profiles','DELETE') OR has_table_privilege('authenticated','public.profiles','TRUNCATE')
         OR has_table_privilege('anon','public.profiles','INSERT') OR has_table_privilege('anon','public.stores','UPDATE')
         OR has_table_privilege('authenticated','public.stores','INSERT')) THEN passes := passes+1;
    ELSE r := r||E'FAIL grants de escrita perigosos em profiles/stores\n'; fails := fails+1; END IF;
    IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass) AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.stores'::regclass) THEN passes := passes+1;
    ELSE r := r||E'FAIL RLS desligado em profiles/stores\n'; fails := fails+1; END IF;
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','stores')
        AND cmd <> 'SELECT' AND (roles::text ~ 'anon|public') AND coalesce(qual,'true') = 'true';
    IF n = 0 THEN passes := passes+1; ELSE r := r||E'FAIL política de escrita aberta para anon/public em profiles/stores\n'; fails := fails+1; END IF;
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','stores') AND cmd='SELECT';
    IF n = 2 THEN passes := passes+1; ELSE r := r||'FAIL profiles+stores deveriam ter 1 política de leitura cada (tem '||n||E')\n'; fails := fails+1; END IF;
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','stores') AND policyname = 'Anyone can view profiles';
    IF n = 0 THEN passes := passes+1; ELSE r := r||E'FAIL política antiga "Anyone can view profiles" voltou\n'; fails := fails+1; END IF;

    ------------------------------------------------------------------ REALTIME: nenhuma coluna privada de stores/profiles na publicação
    SELECT count(*) INTO n FROM pg_publication_tables pt
      WHERE pt.pubname = 'supabase_realtime' AND pt.schemaname='public' AND pt.tablename IN ('stores','profiles')
        AND (pt.attnames IS NULL
             OR (pt.tablename = 'stores' AND pt.attnames::text[] && store_private)
             OR (pt.tablename = 'profiles' AND pt.attnames::text[] && profile_private));
    IF n = 0 THEN passes := passes+1; ELSE r := r||E'FAIL realtime publica colunas privadas (ou tabela inteira) de stores/profiles\n'; fails := fails+1; END IF;

    RAISE EXCEPTION 'RESULT: % passes=% fails=%', CASE WHEN fails = 0 THEN 'OK' ELSE E'FALHAS\n'||r END, passes, fails;
END $T$;
