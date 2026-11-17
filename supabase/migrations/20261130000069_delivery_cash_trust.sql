-- 20261130000069_delivery_cash_trust.sql
--
-- LIBERAÇÃO POR ETAPAS DO ENTREGADOR PARA DINHEIRO E MAQUININHA (decisão do dono, 16/11/2026: "a pessoa não pode entrar no iUser,
-- se cadastrar e já receber entrega com dinheiro vivo: dá margem para golpe no iUser, no lojista e no cliente").
--
-- Antes, a trava do caixa (migration ...12) só agia DEPOIS do problema: quem não repassava era barrado. Agora há uma trava ANTES:
--   • NOVO (falta algum requisito): só entrega em que ele não toca no dinheiro (pedido pago por Pix). Pedido em DINHEIRO ou no
--     CARTÃO (a maquininha é da loja e também pode sumir) nem aparece para ele (política de ride_offers) e o banco recusa a
--     candidatura (HINT cash_trust_new).
--   • INICIANTE (cumpriu os requisitos, menos de 30 entregas): dinheiro/maquininha até R$ 60 por entrega e até R$ 80 com ele ao
--     mesmo tempo (entregas aceitas ainda não concluídas + repasses em aberto). HINTs cash_trust_order_max / cash_trust_open_max.
--   • LIBERADO (30 entregas ou mais): sem limite próprio; vale a trava do caixa de sempre (R$ 300 em aberto, repasse vencido...).
-- Requisitos (valores do dono/da proposta, editáveis em delivery_trust_settings, sem tela ainda): selfie no cadastro do veículo,
-- chave Pix própria (driver_payout_keys), 10 entregas de loja concluídas (todas têm prova desde a ...11), 7 dias de conta,
-- nenhuma contestação perdida e nenhum repasse atrasado nos últimos 90 dias, nota média 4,5+ (só conta com 3+ avaliações).
-- EXCEÇÃO: o entregador FAVORITO aceito da loja (store_favorite_drivers) leva dinheiro DELA desde o primeiro dia (a loja o conhece
-- e assume o risco). Pedido por Pix não muda nada. Nada disto vale para corrida de passageiro.
-- Onde vale: a lista do motorista (ride_offers_select), o aviso do celular (cash_trust_filter, usado por lib/notifyDrivers.ts) e a
-- candidatura (gatilho a_ride_applications_cash_trust, roda antes dos outros e vale também pela rota do aviso, que usa a chave de serviço).
-- Rollback: supabase/rollbacks/delivery_cash_trust_rollback.sql. Cenários: supabase/tests/delivery_cash_trust_scenarios.sql.

-- ===== configuração (uma linha; sem acesso do app) =====
CREATE TABLE IF NOT EXISTS public.delivery_trust_settings (
    id                     boolean PRIMARY KEY DEFAULT true CHECK (id),
    enabled                boolean NOT NULL DEFAULT true,
    min_deliveries         integer NOT NULL DEFAULT 10 CHECK (min_deliveries BETWEEN 0 AND 1000),
    min_account_days       integer NOT NULL DEFAULT 7 CHECK (min_account_days BETWEEN 0 AND 365),
    min_rating             numeric(3,2) NOT NULL DEFAULT 4.5 CHECK (min_rating BETWEEN 1 AND 5),
    min_reviews_for_rating integer NOT NULL DEFAULT 3 CHECK (min_reviews_for_rating BETWEEN 1 AND 100),
    require_pix            boolean NOT NULL DEFAULT true,
    require_selfie         boolean NOT NULL DEFAULT true,
    lookback_days          integer NOT NULL DEFAULT 90 CHECK (lookback_days BETWEEN 1 AND 365),
    starter_per_order      numeric(10,2) NOT NULL DEFAULT 60 CHECK (starter_per_order >= 0),
    starter_open_max       numeric(10,2) NOT NULL DEFAULT 80 CHECK (starter_open_max >= 0),
    full_after_deliveries  integer NOT NULL DEFAULT 30 CHECK (full_after_deliveries BETWEEN 0 AND 5000),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CHECK (full_after_deliveries >= min_deliveries)
);
INSERT INTO public.delivery_trust_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.delivery_trust_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_trust_settings FROM anon, authenticated;
GRANT ALL ON public.delivery_trust_settings TO service_role;

-- pedido em que o entregador toca no dinheiro (na mão) ou leva a maquininha da loja
CREATE OR REPLACE FUNCTION public._order_handles_money(p_method text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
    SELECT lower(coalesce(p_method, '')) IN ('dinheiro', 'money', 'cash', 'cartao', 'cartão', 'credit_card', 'debit_card', 'card')
$$;

-- ===== a situação do entregador (só números e códigos; nunca dado de terceiros) =====
CREATE OR REPLACE FUNCTION public._driver_cash_trust(p_driver uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    cfg public.delivery_trust_settings;
    v_deliveries integer; v_days integer; v_reviews integer; v_avg numeric;
    v_pix boolean; v_selfie boolean; v_lost integer; v_late integer;
    v_open numeric; v_missing text[] := ARRAY[]::text[]; v_level text;
BEGIN
    SELECT * INTO cfg FROM public.delivery_trust_settings WHERE id;
    SELECT count(*) INTO v_deliveries FROM public.ride_requests
     WHERE driver_id = p_driver AND order_id IS NOT NULL AND status = 'completed';
    SELECT floor(extract(epoch FROM now() - COALESCE(p.created_at, u.created_at, now())) / 86400)::int INTO v_days
      FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE p.id = p_driver;
    SELECT count(*), avg(rating) INTO v_reviews, v_avg FROM public.ride_reviews WHERE reviewee_id = p_driver;
    v_pix := EXISTS (SELECT 1 FROM public.driver_payout_keys WHERE driver_id = p_driver);
    v_selfie := EXISTS (SELECT 1 FROM public.driver_vehicles WHERE driver_id = p_driver AND btrim(COALESCE(driver_photo_url, '')) <> '');
    SELECT count(*) INTO v_lost FROM public.delivery_disputes
     WHERE driver_id = p_driver AND outcome = 'driver_at_fault' AND decided_at > now() - make_interval(days => cfg.lookback_days);
    SELECT count(*) INTO v_late FROM public.store_dues
     WHERE driver_id = p_driver AND due_at IS NOT NULL AND created_at > now() - make_interval(days => cfg.lookback_days)
       AND ((status = 'open' AND due_at < now()) OR (declared_at IS NOT NULL AND declared_at > due_at) OR status = 'disputed');
    -- o que ele está levando de loja AGORA: entregas aceitas ainda não concluídas (dinheiro/cartão) + repasses em aberto
    SELECT COALESCE((SELECT sum(o.total_amount) FROM public.ride_requests r JOIN public.orders o ON o.id = r.order_id
                      WHERE r.driver_id = p_driver AND r.status = 'accepted' AND public._order_handles_money(o.payment_method)), 0)
         + COALESCE((SELECT sum(amount) FROM public.store_dues
                      WHERE driver_id = p_driver AND kind IN ('cash', 'dispute_debt') AND status = 'open'), 0)
      INTO v_open;

    IF cfg.require_selfie AND NOT v_selfie THEN v_missing := array_append(v_missing, 'selfie'); END IF;
    IF cfg.require_pix AND NOT v_pix THEN v_missing := array_append(v_missing, 'pix'); END IF;
    IF v_deliveries < cfg.min_deliveries THEN v_missing := array_append(v_missing, 'deliveries'); END IF;
    IF COALESCE(v_days, 0) < cfg.min_account_days THEN v_missing := array_append(v_missing, 'days'); END IF;
    IF v_lost > 0 THEN v_missing := array_append(v_missing, 'dispute'); END IF;
    IF v_late > 0 THEN v_missing := array_append(v_missing, 'late'); END IF;
    IF v_reviews >= cfg.min_reviews_for_rating AND v_avg < cfg.min_rating THEN v_missing := array_append(v_missing, 'rating'); END IF;

    v_level := CASE WHEN NOT cfg.enabled THEN 'full'
                    WHEN cardinality(v_missing) > 0 THEN 'new'
                    WHEN v_deliveries < cfg.full_after_deliveries THEN 'starter'
                    ELSE 'full' END;
    RETURN jsonb_build_object(
        'enabled', cfg.enabled, 'level', v_level, 'missing', to_jsonb(v_missing),
        'deliveries', v_deliveries, 'min_deliveries', cfg.min_deliveries, 'full_after', cfg.full_after_deliveries,
        'days', COALESCE(v_days, 0), 'min_days', cfg.min_account_days,
        'rating', CASE WHEN v_reviews > 0 THEN round(v_avg, 2) END, 'reviews', v_reviews, 'min_rating', cfg.min_rating,
        'has_pix', v_pix, 'has_selfie', v_selfie,
        'per_order_max', CASE v_level WHEN 'new' THEN 0 WHEN 'starter' THEN cfg.starter_per_order END,
        'open_max', CASE v_level WHEN 'new' THEN 0 WHEN 'starter' THEN cfg.starter_open_max END,
        'open_now', v_open);
END; $$;
REVOKE ALL ON FUNCTION public._driver_cash_trust(uuid) FROM PUBLIC, anon, authenticated;

-- NULL = pode pegar esta entrega; senão o código do motivo
CREATE OR REPLACE FUNCTION public._cash_trust_check(p_ride uuid, p_driver uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; t jsonb;
BEGIN
    IF p_driver IS NULL THEN RETURN NULL; END IF;
    IF NOT COALESCE((SELECT enabled FROM public.delivery_trust_settings WHERE id), true) THEN RETURN NULL; END IF;
    SELECT rr.store_id, o.payment_method, o.total_amount INTO r
      FROM public.ride_requests rr JOIN public.orders o ON o.id = rr.order_id WHERE rr.id = p_ride;
    IF NOT FOUND OR NOT public._order_handles_money(r.payment_method) THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.store_favorite_drivers f WHERE f.store_id = r.store_id AND f.driver_id = p_driver AND f.status = 'accepted') THEN RETURN NULL; END IF;
    t := public._driver_cash_trust(p_driver);
    IF t->>'level' = 'full' THEN RETURN NULL; END IF;
    IF t->>'level' = 'new' THEN RETURN 'cash_trust_new'; END IF;
    IF COALESCE(r.total_amount, 0) > (t->>'per_order_max')::numeric THEN RETURN 'cash_trust_order_max'; END IF;
    IF (t->>'open_now')::numeric + COALESCE(r.total_amount, 0) > (t->>'open_max')::numeric THEN RETURN 'cash_trust_open_max'; END IF;
    RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public._cash_trust_check(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- usado pela política da lista: só a PRÓPRIA situação; quem já se candidatou à corrida continua vendo a oferta
CREATE OR REPLACE FUNCTION public._cash_trust_ok(p_ride uuid, p_user uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_user IS NULL OR p_user IS DISTINCT FROM auth.uid() THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM public.ride_applications WHERE ride_request_id = p_ride AND applicant_id = p_user) THEN RETURN true; END IF;
    RETURN public._cash_trust_check(p_ride, p_user) IS NULL;
END; $$;
REVOKE ALL ON FUNCTION public._cash_trust_ok(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._cash_trust_ok(uuid, uuid) TO authenticated;

-- a lista do motorista: a oferta de entrega em dinheiro/maquininha nem aparece para quem ainda não pode levá-la
DROP POLICY IF EXISTS ride_offers_select ON public.ride_offers;
CREATE POLICY ride_offers_select ON public.ride_offers FOR SELECT TO authenticated
    USING (NOT EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.id = ride_offers.id AND r.requester_id = auth.uid())
           AND public._offer_open_to(ride_offers.id, auth.uid())
           AND (ride_offers.order_id IS NULL OR public._cash_trust_ok(ride_offers.id, auth.uid())));

-- a candidatura: recusada no banco (vale também pela rota do aviso do celular, que usa a chave de serviço)
CREATE OR REPLACE FUNCTION public.ride_applications_cash_trust() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; t jsonb;
BEGIN
    v_code := public._cash_trust_check(NEW.ride_request_id, NEW.applicant_id);
    IF v_code IS NULL THEN RETURN NEW; END IF;
    t := public._driver_cash_trust(NEW.applicant_id);
    IF v_code = 'cash_trust_new' THEN
        RAISE EXCEPTION 'Entregas com dinheiro ou maquininha liberam depois das suas primeiras entregas com Pix. Veja o que falta em Entregas.'
            USING HINT = v_code, ERRCODE = 'P0001';
    ELSIF v_code = 'cash_trust_order_max' THEN
        RAISE EXCEPTION 'Por enquanto você leva até R$ % em dinheiro ou maquininha por entrega. O limite sai depois de % entregas.',
            to_char((t->>'per_order_max')::numeric, 'FM999990'), t->>'full_after' USING HINT = v_code, ERRCODE = 'P0001';
    ELSE
        RAISE EXCEPTION 'Por enquanto você leva até R$ % de lojas ao mesmo tempo. Conclua e repasse as entregas em andamento para pegar outra.',
            to_char((t->>'open_max')::numeric, 'FM999990') USING HINT = v_code, ERRCODE = 'P0001';
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.ride_applications_cash_trust() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS a_ride_applications_cash_trust ON public.ride_applications;
CREATE TRIGGER a_ride_applications_cash_trust BEFORE INSERT ON public.ride_applications
    FOR EACH ROW EXECUTE FUNCTION public.ride_applications_cash_trust();

-- ===== leitura do próprio motorista (o cartão "Dinheiro e maquininha" da Central de entregas) =====
CREATE OR REPLACE FUNCTION public.get_my_cash_trust() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); cfg public.delivery_trust_settings;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'login necessário' USING ERRCODE = '42501'; END IF;
    SELECT * INTO cfg FROM public.delivery_trust_settings WHERE id;
    RETURN public._driver_cash_trust(uid) || jsonb_build_object(
        'starter_per_order', cfg.starter_per_order, 'starter_open_max', cfg.starter_open_max,
        'favorite_stores', (SELECT count(*) FROM public.store_favorite_drivers WHERE driver_id = uid AND status = 'accepted'));
END; $$;
REVOKE ALL ON FUNCTION public.get_my_cash_trust() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_cash_trust() TO authenticated;

-- ===== o aviso do celular (servidor): dos motoristas candidatos ao aviso, só quem pode levar esta entrega =====
CREATE OR REPLACE FUNCTION public.cash_trust_filter(p_ride uuid, p_drivers uuid[]) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(array_agg(d), ARRAY[]::uuid[]) FROM unnest(p_drivers) AS d WHERE public._cash_trust_check(p_ride, d) IS NULL
$$;
REVOKE ALL ON FUNCTION public.cash_trust_filter(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cash_trust_filter(uuid, uuid[]) TO service_role;

