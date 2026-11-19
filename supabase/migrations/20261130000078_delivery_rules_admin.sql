-- 20261130000078_delivery_rules_admin.sql
--
-- REGRAS DA OPERAÇÃO DE ENTREGA NO ADMIN (18/11/2026; estudo docs/estudos/2026-11-18-delivery-concorrencia-dinheiro.md): os prazos e limites que só mudavam por SQL
-- passam a ter tela (Admin → Entregas → "Prazos e limites da operação"):
--   cycle    = delivery_cycle_settings  (a loja que não aceita, o entregador que demora, atraso, desistências)
--   hold     = delivery_hold_settings   (pedido retido esperando entregador: quando sugerir retirada e quando cancelar)
--   dues     = delivery_dues_settings   (caixa do entregador: dinheiro em aberto, prazos de repasse/maquininha, contestação)
--   trust    = delivery_trust_settings  (liberação por etapas para dinheiro e maquininha)
--   postpaid = postpaid_settings        (limite de dívida e teto mensal do Pós-pago)
-- Só o serviço chama (a rota exige o administrador geral; o id dele vem do login). Cada valor mudado vai para admin_config_audit (scope 'delivery_rules:<grupo>').
-- A mesma validação roda na tela e na rota (modules/delivery-rules) e o banco ainda tem os CHECKs de cada tabela.
-- Rollback: supabase/rollbacks/delivery_rules_admin_rollback.sql.

CREATE OR REPLACE FUNCTION public._delivery_rules_table(p_group text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_group WHEN 'cycle' THEN 'delivery_cycle_settings' WHEN 'hold' THEN 'delivery_hold_settings' WHEN 'dues' THEN 'delivery_dues_settings'
                        WHEN 'trust' THEN 'delivery_trust_settings' WHEN 'postpaid' THEN 'postpaid_settings' END
$$;
REVOKE ALL ON FUNCTION public._delivery_rules_table(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_delivery_rules() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb := '{}'::jsonb; g text; r jsonb;
BEGIN
    FOREACH g IN ARRAY ARRAY['cycle', 'hold', 'dues', 'trust', 'postpaid'] LOOP
        EXECUTE format('SELECT to_jsonb(t) - ''id'' - ''updated_at'' FROM public.%I t LIMIT 1', public._delivery_rules_table(g)) INTO r;
        v := v || jsonb_build_object(g, COALESCE(r, '{}'::jsonb));
    END LOOP;
    RETURN v;
END; $$;
REVOKE ALL ON FUNCTION public.admin_get_delivery_rules() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_delivery_rules() TO service_role;

-- muda vários valores de um grupo de uma vez (um UPDATE só, para os CHECKs que comparam colunas valerem no conjunto)
CREATE OR REPLACE FUNCTION public.admin_update_delivery_rules(p_group text, p_patch jsonb, p_admin uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_table text := public._delivery_rules_table(p_group); v_old jsonb; v_sets text; k text; v_type text; v_changed int := 0;
BEGIN
    IF v_table IS NULL THEN RAISE EXCEPTION 'Grupo inválido' USING ERRCODE = '22023'; END IF;
    IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN RAISE EXCEPTION 'Nada para mudar' USING ERRCODE = '22023'; END IF;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t LIMIT 1', v_table) INTO v_old;
    FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
        IF k IN ('id', 'updated_at') THEN RAISE EXCEPTION 'Campo % não pode ser mudado', k USING ERRCODE = '22023'; END IF;
        SELECT CASE WHEN data_type = 'numeric' THEN 'numeric' WHEN data_type = 'integer' THEN 'integer' WHEN data_type = 'boolean' THEN 'boolean' END INTO v_type
          FROM information_schema.columns WHERE table_schema = 'public' AND table_name = v_table AND column_name = k;
        IF v_type IS NULL THEN RAISE EXCEPTION 'Campo desconhecido: %', k USING ERRCODE = '22023'; END IF;
        IF jsonb_typeof(p_patch->k) NOT IN ('number', 'boolean', 'null') THEN RAISE EXCEPTION 'Valor inválido em %', k USING ERRCODE = '22023'; END IF;
        v_sets := COALESCE(v_sets || ', ', '') || format('%I = ($1->>%L)::%s', k, k, v_type);
    END LOOP;
    BEGIN
        -- todas as tabelas de regras têm UMA linha (id = true); o WHERE também atende o pg-safeupdate da API
        EXECUTE format('UPDATE public.%I SET %s%s WHERE id', v_table, v_sets,
                       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'updated_at') THEN ', updated_at = now()' ELSE '' END)
        USING p_patch;
    EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'Valor fora do permitido: confira os números (%)', SQLERRM USING ERRCODE = '22023';
    END;
    FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
        IF (v_old->k) IS DISTINCT FROM (p_patch->k) THEN
            INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('delivery_rules:' || p_group, k, v_old->k, p_patch->k, p_admin);
            v_changed := v_changed + 1;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('changed', v_changed, 'rules', public.admin_get_delivery_rules());
END; $$;
REVOKE ALL ON FUNCTION public.admin_update_delivery_rules(text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_delivery_rules(text, jsonb, uuid) TO service_role;
