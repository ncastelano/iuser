-- Etapa 2.7.1 (parte 1) — HOTFIX DE SEGURANÇA: profiles estava SEM RLS e com todas as permissões para anon/authenticated.
--
-- ACHADO: public.profiles tinha RLS DESLIGADA (as policies existiam mas eram ignoradas) e GRANT de SELECT/INSERT/UPDATE/DELETE/TRUNCATE para anon e
-- authenticated. Na prática QUALQUER pessoa com a chave pública podia ler todas as colunas (e-mail, CPF/CNPJ, Pix, saldo, flags de admin…) E alterar ou
-- apagar qualquer perfil (testado numa transação desfeita: anon atualizou os 36 perfis). Esta migration só FECHA ESCRITA e remove funções perigosas;
-- a leitura (colunas privadas) é fechada na parte 2, depois de as telas migrarem. Nada aqui muda o que as telas leem.
--
--  * profiles: RLS ligada (policies existentes: SELECT liberado por enquanto; INSERT/UPDATE só da própria linha). Sem DELETE/TRUNCATE para o app.
--  * anon passa a ser SOMENTE LEITURA em profiles e stores; authenticated sem TRUNCATE/REFERENCES/TRIGGER.
--  * Funções SECURITY DEFINER que qualquer anônimo podia chamar e que o app não usa (mexem em saldo, notificação, perfil, rede, log) perdem EXECUTE.
--  * Realtime: stores sai da publicação e volta só com as colunas públicas (a publicação mandava a linha inteira, com Pix e dados do bot).

-- ============================================================
-- 1. profiles: RLS ligada
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can create own profile" ON public.profiles;        -- duplicada de "Permitir INSERT para usuários autenticados"
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;        -- duplicada de "Permitir UPDATE para próprio usuário"
DROP POLICY IF EXISTS "Permitir SELECT para todos" ON public.profiles;          -- duplicada de "Anyone can view profiles" (a leitura é restringida por coluna na parte 2)

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.profiles FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.stores FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stores FROM anon;

-- ============================================================
-- 2. Funções que qualquer anônimo executava e o app não usa
--    (nenhuma outra função/gatilho do banco depende delas; service_role continua podendo)
-- ============================================================
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace
           AND p.proname IN ('bind_upline', 'vincular_upline', 'update_cascade_levels', 'complete_transaction', 'create_transaction', 'create_notification',
                             'create_order', 'mark_all_notifications_as_read', 'mark_notification_as_read', 'log_event', 'update_profile_location',
                             'create_or_update_profile', 'get_asaas_financial_overview', 'get_database_stats')
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END LOOP;
    -- dívida do motorista: as policies de candidatura chamam com o usuário logado (authenticated mantém); anônimo não precisa
    FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'get_driver_postpaid_debt' LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    END LOOP;
END $$;

-- ============================================================
-- 3. Realtime: stores só com colunas públicas (sem Pix, bot de WhatsApp nem dados de plano)
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'stores') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.stores;
    END IF;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stores (
        id, name, "storeSlug", description, logo_url, banner_url, owner_id, is_active, meta_title, meta_description, ratings_avg, ratings_count,
        prep_time_min, prep_time_max, price_min, price_max, created_at, calendar_url, whatsapp, address, business_hours, category, view_count,
        accepts_delivery, accepts_pickup, accepts_pix, accepts_card, accepts_cash, store_address, store_lat, store_lng, delivery_type, delivery_fee,
        delivery_distance_rules, delivery_fee_per_km, delivery_base_distance, delivery_base_fee, allow_scheduling, address_number, address_complement,
        instagram, share_count, vip_club_enabled, vip_club_price, vip_club_description, iuser_delivery_enabled, whatsapp_orders_enabled, show_whatsapp,
        scheduling_activated_at, chat_enabled, mutual_reviews
    );
END $$;
