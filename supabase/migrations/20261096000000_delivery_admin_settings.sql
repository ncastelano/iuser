-- Etapa 2.2 — CONFIGURAÇÕES ADMINISTRATIVAS DO NOVO FLUXO DE ENTREGA (globais, inativas para o fluxo atual).
--
-- Uma única fonte de verdade por conceito: a linha global de delivery_dispatch_settings (já existente e já usada pelo fluxo
-- atual) ganha as colunas que faltavam. NADA daqui muda o fluxo versão 1: process_order_delivery_dispatches e as RPCs atuais
-- continuam lendo só as colunas antigas, com os mesmos valores. As colunas novas serão consumidas pelas próximas etapas.
-- A tarifa base / valor por km / extras seguem em platform_tariffs (não duplicados aqui).
--
-- Reaproveitado (já existia): retry_interval_minutes (intervalo entre rodadas = expansão de raio), initial_radius_km,
-- radius_step_km, max_rounds (tentativas), increase_kind/increase_value (modo e valor do aumento), max_freight (teto
-- absoluto), platform_fee_percent, notify_url.
--
-- Segurança: só o servidor escreve (RPC admin_update_delivery_settings, service role, chamada pela rota que exige o admin
-- geral); o app (authenticated) não lê nem escreve a tabela. Toda mudança gera linha em admin_config_audit.

-- ============================================================
-- 1. Colunas novas
-- ============================================================
ALTER TABLE public.delivery_dispatch_settings
    -- precificação (a tarifa em si fica em platform_tariffs)
    ADD COLUMN IF NOT EXISTS min_freight numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS freight_rounding_step numeric NOT NULL DEFAULT 0.01,
    ADD COLUMN IF NOT EXISTS freight_rounding_mode text NOT NULL DEFAULT 'NEAREST',
    -- busca
    ADD COLUMN IF NOT EXISTS max_radius_km numeric NOT NULL DEFAULT 25,
    ADD COLUMN IF NOT EXISTS offer_duration_seconds integer NOT NULL DEFAULT 120,
    ADD COLUMN IF NOT EXISTS max_search_minutes integer NOT NULL DEFAULT 30,
    -- aumento automático do frete (dentro do limite, sem pedir ao cliente)
    ADD COLUMN IF NOT EXISTS auto_increase_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS auto_increase_cap_amount numeric,
    ADD COLUMN IF NOT EXISTS auto_increase_cap_percent numeric DEFAULT 20,
    ADD COLUMN IF NOT EXISTS max_price_adjustments integer NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS price_adjust_interval_minutes integer NOT NULL DEFAULT 5,
    -- autorização do cliente acima do limite automático
    ADD COLUMN IF NOT EXISTS customer_authorization_timeout_minutes integer NOT NULL DEFAULT 10,
    -- estratégia
    ADD COLUMN IF NOT EXISTS search_strategy text NOT NULL DEFAULT 'RAIO_E_PRECO_SIMULTANEAMENTE',
    -- reserva do motorista
    ADD COLUMN IF NOT EXISTS reservation_timeout_minutes integer NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS reservation_expiry_action text NOT NULL DEFAULT 'RELEASE_AND_SEARCH_AGAIN',
    -- contraproposta do motorista ("Minha tarifa"): só proposta de valor, nunca preço direto
    ADD COLUMN IF NOT EXISTS driver_counter_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS driver_counter_max_amount numeric,
    ADD COLUMN IF NOT EXISTS driver_counter_max_percent_over_offer numeric NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS driver_counter_max_per_ride integer NOT NULL DEFAULT 3,
    -- cancelamentos (sem penalidade automática nesta etapa)
    ADD COLUMN IF NOT EXISTS cancel_customer_during_search boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS cancel_customer_during_reservation boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS cancel_driver_after_reservation boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS cancel_after_receipt_policy text NOT NULL DEFAULT 'ADMIN_REVIEW',
    ADD COLUMN IF NOT EXISTS cancel_reason_required boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS admin_review_after_payment boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS admin_review_after_pickup boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS admin_review_payment_dispute boolean NOT NULL DEFAULT true,
    -- pendências motorista -> loja (diferente da dívida com o iUser)
    ADD COLUMN IF NOT EXISTS block_driver_open_obligation boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS obligation_block_min_amount numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS obligation_unblock_on_settlement boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS obligation_unblock_needs_admin boolean NOT NULL DEFAULT false,
    -- ativação futura do fluxo 2 (global). NÃO liga nesta etapa: a constraint abaixo impede.
    ADD COLUMN IF NOT EXISTS new_delivery_flow_enabled boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. Coerência no banco (a rota valida antes, mas o banco é a última barreira)
-- ============================================================
ALTER TABLE public.delivery_dispatch_settings
    ADD CONSTRAINT dds_min_freight_check CHECK (min_freight >= 0 AND min_freight <= max_freight),
    ADD CONSTRAINT dds_rounding_step_check CHECK (freight_rounding_step IN (0.01, 0.05, 0.10, 0.25, 0.50, 1.00)),
    ADD CONSTRAINT dds_rounding_mode_check CHECK (freight_rounding_mode IN ('NEAREST', 'UP')),
    ADD CONSTRAINT dds_max_radius_check CHECK (max_radius_km >= initial_radius_km AND max_radius_km <= 200),
    ADD CONSTRAINT dds_radius_step_positive_check CHECK (radius_step_km > 0),
    ADD CONSTRAINT dds_max_rounds_min_check CHECK (max_rounds >= 1),
    ADD CONSTRAINT dds_offer_duration_check CHECK (offer_duration_seconds BETWEEN 10 AND 3600 AND offer_duration_seconds <= retry_interval_minutes * 60),
    ADD CONSTRAINT dds_max_search_check CHECK (max_search_minutes BETWEEN 1 AND 720 AND max_search_minutes >= retry_interval_minutes),
    ADD CONSTRAINT dds_increase_percent_check CHECK (increase_kind <> 'percent' OR increase_value <= 100),
    ADD CONSTRAINT dds_auto_cap_amount_check CHECK (auto_increase_cap_amount IS NULL OR (auto_increase_cap_amount >= 0 AND auto_increase_cap_amount <= max_freight - min_freight)),
    ADD CONSTRAINT dds_auto_cap_percent_check CHECK (auto_increase_cap_percent IS NULL OR (auto_increase_cap_percent >= 0 AND auto_increase_cap_percent <= 200)),
    ADD CONSTRAINT dds_price_adjustments_check CHECK (max_price_adjustments BETWEEN 0 AND 50 AND (NOT auto_increase_enabled OR max_price_adjustments >= 1)),
    ADD CONSTRAINT dds_price_adjust_interval_check CHECK (price_adjust_interval_minutes BETWEEN 1 AND 240),
    ADD CONSTRAINT dds_customer_auth_timeout_check CHECK (customer_authorization_timeout_minutes BETWEEN 1 AND 240),
    ADD CONSTRAINT dds_search_strategy_check CHECK (search_strategy IN ('EXPANDIR_RAIO_PRIMEIRO', 'AUMENTAR_PRECO_PRIMEIRO', 'RAIO_E_PRECO_SIMULTANEAMENTE')),
    ADD CONSTRAINT dds_reservation_timeout_check CHECK (reservation_timeout_minutes BETWEEN 1 AND 60),
    ADD CONSTRAINT dds_reservation_action_check CHECK (reservation_expiry_action IN ('RELEASE_AND_SEARCH_AGAIN', 'CANCEL_DELIVERY')),
    ADD CONSTRAINT dds_counter_amount_check CHECK (driver_counter_max_amount IS NULL OR (driver_counter_max_amount > 0 AND driver_counter_max_amount <= max_freight)),
    ADD CONSTRAINT dds_counter_percent_check CHECK (driver_counter_max_percent_over_offer BETWEEN 0 AND 200),
    ADD CONSTRAINT dds_counter_per_ride_check CHECK (driver_counter_max_per_ride BETWEEN 1 AND 20),
    ADD CONSTRAINT dds_cancel_after_receipt_check CHECK (cancel_after_receipt_policy IN ('BLOCKED', 'ADMIN_REVIEW', 'ALLOWED_WITH_OBLIGATION')),
    ADD CONSTRAINT dds_obligation_block_min_check CHECK (obligation_block_min_amount >= 0),
    ADD CONSTRAINT dds_new_flow_inactive_check CHECK (NOT new_delivery_flow_enabled);   -- relaxada só em etapa posterior

-- ============================================================
-- 3. Auditoria genérica de configurações administrativas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_config_audit (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope       text NOT NULL,
    setting     text NOT NULL,
    old_value   jsonb,
    new_value   jsonb,
    changed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_config_audit_scope_idx ON public.admin_config_audit (scope, changed_at DESC);
ALTER TABLE public.admin_config_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_config_audit FROM PUBLIC, anon, authenticated;   -- só o servidor lê e escreve

CREATE OR REPLACE FUNCTION public.audit_delivery_settings_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    k text;
    v_admin uuid := NULLIF(current_setting('app.config_admin', true), '')::uuid;
    o jsonb := to_jsonb(OLD);
    n jsonb := to_jsonb(NEW);
BEGIN
    FOR k IN SELECT key FROM jsonb_each(n) WHERE key <> 'updated_at' LOOP
        IF n->k IS DISTINCT FROM o->k THEN
            INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by)
            VALUES ('delivery_dispatch_settings', k, o->k, n->k, v_admin);
        END IF;
    END LOOP;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_delivery_settings_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS delivery_dispatch_settings_audit ON public.delivery_dispatch_settings;
CREATE TRIGGER delivery_dispatch_settings_audit
    BEFORE UPDATE ON public.delivery_dispatch_settings
    FOR EACH ROW EXECUTE FUNCTION public.audit_delivery_settings_change();

-- ============================================================
-- 4. Escrita só pelo servidor, atômica (valida pelas constraints, audita pelo gatilho)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_delivery_settings(p_admin uuid, p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    cur public.delivery_dispatch_settings;
    v_allowed text[] := ARRAY['retry_interval_minutes','increase_kind','increase_value','initial_radius_km','radius_step_km','max_freight','max_rounds','platform_fee_percent','min_freight','freight_rounding_step','freight_rounding_mode','max_radius_km','offer_duration_seconds','max_search_minutes','auto_increase_enabled','auto_increase_cap_amount','auto_increase_cap_percent','max_price_adjustments','price_adjust_interval_minutes','customer_authorization_timeout_minutes','search_strategy','reservation_timeout_minutes','reservation_expiry_action','driver_counter_enabled','driver_counter_max_amount','driver_counter_max_percent_over_offer','driver_counter_max_per_ride','cancel_customer_during_search','cancel_customer_during_reservation','cancel_driver_after_reservation','cancel_after_receipt_policy','cancel_reason_required','admin_review_after_payment','admin_review_after_pickup','admin_review_payment_dispute','block_driver_open_obligation','obligation_block_min_amount','obligation_unblock_on_settlement','obligation_unblock_needs_admin','new_delivery_flow_enabled'];
    v_bad text;
    v_filtered jsonb;
BEGIN
    IF p_admin IS NULL THEN RAISE EXCEPTION 'Administrador não informado' USING ERRCODE = '42501'; END IF;
    SELECT key INTO v_bad FROM jsonb_object_keys(p_changes) AS key WHERE key <> ALL (v_allowed) LIMIT 1;
    IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Configuração desconhecida ou não editável: %', v_bad USING ERRCODE = '22023'; END IF;
    PERFORM set_config('app.config_admin', p_admin::text, true);
    SELECT * INTO cur FROM public.delivery_dispatch_settings WHERE id FOR UPDATE;
    UPDATE public.delivery_dispatch_settings s SET
        retry_interval_minutes = n.retry_interval_minutes,
        increase_kind = n.increase_kind,
        increase_value = n.increase_value,
        initial_radius_km = n.initial_radius_km,
        radius_step_km = n.radius_step_km,
        max_freight = n.max_freight,
        max_rounds = n.max_rounds,
        platform_fee_percent = n.platform_fee_percent,
        min_freight = n.min_freight,
        freight_rounding_step = n.freight_rounding_step,
        freight_rounding_mode = n.freight_rounding_mode,
        max_radius_km = n.max_radius_km,
        offer_duration_seconds = n.offer_duration_seconds,
        max_search_minutes = n.max_search_minutes,
        auto_increase_enabled = n.auto_increase_enabled,
        auto_increase_cap_amount = n.auto_increase_cap_amount,
        auto_increase_cap_percent = n.auto_increase_cap_percent,
        max_price_adjustments = n.max_price_adjustments,
        price_adjust_interval_minutes = n.price_adjust_interval_minutes,
        customer_authorization_timeout_minutes = n.customer_authorization_timeout_minutes,
        search_strategy = n.search_strategy,
        reservation_timeout_minutes = n.reservation_timeout_minutes,
        reservation_expiry_action = n.reservation_expiry_action,
        driver_counter_enabled = n.driver_counter_enabled,
        driver_counter_max_amount = n.driver_counter_max_amount,
        driver_counter_max_percent_over_offer = n.driver_counter_max_percent_over_offer,
        driver_counter_max_per_ride = n.driver_counter_max_per_ride,
        cancel_customer_during_search = n.cancel_customer_during_search,
        cancel_customer_during_reservation = n.cancel_customer_during_reservation,
        cancel_driver_after_reservation = n.cancel_driver_after_reservation,
        cancel_after_receipt_policy = n.cancel_after_receipt_policy,
        cancel_reason_required = n.cancel_reason_required,
        admin_review_after_payment = n.admin_review_after_payment,
        admin_review_after_pickup = n.admin_review_after_pickup,
        admin_review_payment_dispute = n.admin_review_payment_dispute,
        block_driver_open_obligation = n.block_driver_open_obligation,
        obligation_block_min_amount = n.obligation_block_min_amount,
        obligation_unblock_on_settlement = n.obligation_unblock_on_settlement,
        obligation_unblock_needs_admin = n.obligation_unblock_needs_admin,
        new_delivery_flow_enabled = n.new_delivery_flow_enabled
      FROM (SELECT (jsonb_populate_record(cur, p_changes)).*) n
     WHERE s.id;
    RETURN to_jsonb((SELECT s FROM public.delivery_dispatch_settings s WHERE s.id));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_delivery_settings(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 5. O app (logado) deixa de ler/escrever a tabela: o painel do admin lê pela rota do servidor
-- ============================================================
DROP POLICY IF EXISTS delivery_settings_read ON public.delivery_dispatch_settings;
REVOKE ALL ON public.delivery_dispatch_settings FROM PUBLIC, anon, authenticated;
