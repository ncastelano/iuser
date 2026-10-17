-- ROLLBACK da Etapa 2.2 (migration 20261096): remove as colunas novas das configurações de entrega, a auditoria genérica e a
-- RPC de escrita, e devolve a leitura da tabela ao app (estado anterior: authenticated só lê).
-- Atenção: apaga admin_config_audit (histórico de alterações das configurações). Os valores das colunas ANTIGAS
-- (raio inicial, expansão, intervalo, aumento, teto, rodadas, taxa) não são tocados. Reverta também o código da tela
-- (git revert), que depende das colunas e da rota /api/admin/delivery-settings/load.
-- Rode com: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/rollbacks/etapa_2_2_rollback.sql
begin;

DROP TRIGGER IF EXISTS delivery_dispatch_settings_audit ON public.delivery_dispatch_settings;
DROP FUNCTION IF EXISTS public.audit_delivery_settings_change();
DROP FUNCTION IF EXISTS public.admin_update_delivery_settings(uuid, jsonb);
DROP TABLE IF EXISTS public.admin_config_audit;

ALTER TABLE public.delivery_dispatch_settings
    DROP CONSTRAINT IF EXISTS dds_min_freight_check, DROP CONSTRAINT IF EXISTS dds_rounding_step_check, DROP CONSTRAINT IF EXISTS dds_rounding_mode_check,
    DROP CONSTRAINT IF EXISTS dds_max_radius_check, DROP CONSTRAINT IF EXISTS dds_radius_step_positive_check, DROP CONSTRAINT IF EXISTS dds_max_rounds_min_check,
    DROP CONSTRAINT IF EXISTS dds_offer_duration_check, DROP CONSTRAINT IF EXISTS dds_max_search_check, DROP CONSTRAINT IF EXISTS dds_increase_percent_check,
    DROP CONSTRAINT IF EXISTS dds_auto_cap_amount_check, DROP CONSTRAINT IF EXISTS dds_auto_cap_percent_check, DROP CONSTRAINT IF EXISTS dds_price_adjustments_check,
    DROP CONSTRAINT IF EXISTS dds_price_adjust_interval_check, DROP CONSTRAINT IF EXISTS dds_customer_auth_timeout_check, DROP CONSTRAINT IF EXISTS dds_search_strategy_check,
    DROP CONSTRAINT IF EXISTS dds_reservation_timeout_check, DROP CONSTRAINT IF EXISTS dds_reservation_action_check, DROP CONSTRAINT IF EXISTS dds_counter_amount_check,
    DROP CONSTRAINT IF EXISTS dds_counter_percent_check, DROP CONSTRAINT IF EXISTS dds_counter_per_ride_check, DROP CONSTRAINT IF EXISTS dds_cancel_after_receipt_check,
    DROP CONSTRAINT IF EXISTS dds_obligation_block_min_check, DROP CONSTRAINT IF EXISTS dds_new_flow_inactive_check;

ALTER TABLE public.delivery_dispatch_settings
    DROP COLUMN IF EXISTS min_freight, DROP COLUMN IF EXISTS freight_rounding_step, DROP COLUMN IF EXISTS freight_rounding_mode,
    DROP COLUMN IF EXISTS max_radius_km, DROP COLUMN IF EXISTS offer_duration_seconds, DROP COLUMN IF EXISTS max_search_minutes,
    DROP COLUMN IF EXISTS auto_increase_enabled, DROP COLUMN IF EXISTS auto_increase_cap_amount, DROP COLUMN IF EXISTS auto_increase_cap_percent,
    DROP COLUMN IF EXISTS max_price_adjustments, DROP COLUMN IF EXISTS price_adjust_interval_minutes, DROP COLUMN IF EXISTS customer_authorization_timeout_minutes,
    DROP COLUMN IF EXISTS search_strategy, DROP COLUMN IF EXISTS reservation_timeout_minutes, DROP COLUMN IF EXISTS reservation_expiry_action,
    DROP COLUMN IF EXISTS driver_counter_enabled, DROP COLUMN IF EXISTS driver_counter_max_amount, DROP COLUMN IF EXISTS driver_counter_max_percent_over_offer,
    DROP COLUMN IF EXISTS driver_counter_max_per_ride, DROP COLUMN IF EXISTS cancel_customer_during_search, DROP COLUMN IF EXISTS cancel_customer_during_reservation,
    DROP COLUMN IF EXISTS cancel_driver_after_reservation, DROP COLUMN IF EXISTS cancel_after_receipt_policy, DROP COLUMN IF EXISTS cancel_reason_required,
    DROP COLUMN IF EXISTS admin_review_after_payment, DROP COLUMN IF EXISTS admin_review_after_pickup, DROP COLUMN IF EXISTS admin_review_payment_dispute,
    DROP COLUMN IF EXISTS block_driver_open_obligation, DROP COLUMN IF EXISTS obligation_block_min_amount, DROP COLUMN IF EXISTS obligation_unblock_on_settlement,
    DROP COLUMN IF EXISTS obligation_unblock_needs_admin, DROP COLUMN IF EXISTS new_delivery_flow_enabled;

-- estado anterior: usuário logado só lê (a Etapa 1.5 já tinha tirado a escrita e o acesso do visitante)
CREATE POLICY delivery_settings_read ON public.delivery_dispatch_settings FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.delivery_dispatch_settings TO authenticated;

commit;
