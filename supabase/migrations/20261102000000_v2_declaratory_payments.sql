-- Etapa 2.7 — FLUXO FINANCEIRO DECLARATÓRIO E LIBERAÇÃO DA ENTREGA (V2 continua DESLIGADO).
--
-- O iUser NÃO recebe, guarda, divide nem transfere dinheiro desta entrega, e nada aqui chama o Asaas. O dinheiro anda FORA do iUser:
--   cliente → loja (total definitivo) e loja → motorista (frozen_freight integral). O iUser só REGISTRA DECLARAÇÕES (não é confirmação bancária):
--   AGUARDANDO_PAGAMENTO_CLIENTE ─(loja: "recebi do cliente")→ LOJA_INFORMOU_RECEBIMENTO → AGUARDANDO_PAGAMENTO_ENTREGADOR
--   ─(loja: "enviei o frete")→ LOJA_INFORMOU_PAGAMENTO_ENTREGADOR ─(motorista: "recebi")→ ENTREGADOR_CONFIRMOU_RECEBIMENTO → ENTREGA_LIBERADA
--   (motorista: "não recebi" → PAGAMENTO_EM_VERIFICACAO + ocorrência; nada é decidido sozinho). Só ENTREGA_LIBERADA abre a barreira da 2.6.
-- Registro: delivery_payment_events (append-only, 1 declaração de cada tipo por entrega) e delivery_incidents. Valores sempre vindos do banco.
--
-- Pix do MOTORISTA: tabela PRÓPRIA e privada (driver_payout_keys, com consentimento). profiles.pix_key NÃO é usada: hoje ela (e stores.pix_key) é
-- legível por qualquer visitante (política "Anyone can view profiles" + SELECT para anon) — expor o Pix de motorista ali seria vazar chave financeira.
-- Motorista sem chave Pix cadastrada NÃO consegue aceitar entrega V2 (assim a loja nunca recebe do cliente para depois descobrir que não pode pagar).
--
-- Timeout: antes de qualquer dinheiro declarado vale a 2.6 (libera o motorista e volta à busca). A partir de "loja recebeu do cliente" NUNCA volta
-- sozinho à busca: a janela financeira (mesmo tempo da reserva, reiniciado a cada declaração) que vence sem terminar abre ocorrência e vai para
-- PAGAMENTO_EM_VERIFICACAO. Cancelar depois de dinheiro declarado é bloqueado (abra uma ocorrência). Sem reembolso, obrigação ou penalidade automáticos.

-- ============================================================
-- 1. Dados
-- ============================================================
INSERT INTO public.delivery_phase_transitions (from_phase, to_phase, actor_role)
SELECT v.f, v.t, v.a FROM (VALUES
    ('AGUARDANDO_PAGAMENTO_ENTREGADOR', 'PAGAMENTO_EM_VERIFICACAO', 'system'),
    ('LOJA_INFORMOU_PAGAMENTO_ENTREGADOR', 'PAGAMENTO_EM_VERIFICACAO', 'system')
) AS v(f, t, a)
WHERE NOT EXISTS (SELECT 1 FROM public.delivery_phase_transitions x WHERE x.from_phase = v.f AND x.to_phase = v.t AND x.actor_role = v.a);

-- uma declaração de cada tipo por entrega: clique repetido / chamada repetida não duplica
CREATE UNIQUE INDEX IF NOT EXISTS dpe_once_per_dispatch ON public.delivery_payment_events (dispatch_id, kind)
    WHERE kind IN ('store_declared_customer_payment', 'store_declared_driver_payment', 'driver_confirmed_receipt', 'driver_declared_not_received');

-- ============================================================
-- 2. Chave Pix do motorista (privada, com consentimento)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.driver_payout_keys (
    driver_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    pix_key_type   text NOT NULL CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
    pix_key        text NOT NULL CHECK (char_length(pix_key) BETWEEN 5 AND 120),
    consent_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.driver_payout_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dpk_own_select ON public.driver_payout_keys;
CREATE POLICY dpk_own_select ON public.driver_payout_keys FOR SELECT TO authenticated USING (driver_id = auth.uid());
REVOKE ALL ON public.driver_payout_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.driver_payout_keys TO authenticated;        -- só a própria linha; escrita só pela RPC

-- normaliza e valida o FORMATO da chave (não consulta banco nenhum)
CREATE OR REPLACE FUNCTION public._pix_normalize(p_type text, p_key text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE p_type
        WHEN 'cpf' THEN regexp_replace(COALESCE(p_key, ''), '\D', '', 'g')
        WHEN 'cnpj' THEN regexp_replace(COALESCE(p_key, ''), '\D', '', 'g')
        WHEN 'phone' THEN regexp_replace(COALESCE(p_key, ''), '[^0-9]', '', 'g')
        WHEN 'email' THEN lower(btrim(COALESCE(p_key, '')))
        WHEN 'random' THEN lower(btrim(COALESCE(p_key, '')))
        ELSE NULL
    END
$$;
CREATE OR REPLACE FUNCTION public._pix_key_valid(p_type text, p_key text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE p_type
        WHEN 'cpf' THEN p_key ~ '^\d{11}$' AND p_key !~ '^(\d)\1{10}$'
        WHEN 'cnpj' THEN p_key ~ '^\d{14}$' AND p_key !~ '^(\d)\1{13}$'
        WHEN 'phone' THEN p_key ~ '^\d{10,13}$'
        WHEN 'email' THEN p_key ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(p_key) <= 77
        WHEN 'random' THEN p_key ~ '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$'
        ELSE false
    END
$$;
CREATE OR REPLACE FUNCTION public._pix_mask(p_type text, p_key text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE WHEN p_type = 'email' THEN left(p_key, 1) || '***' || substring(p_key from '@.*$') ELSE '***' || right(p_key, 4) END
$$;

CREATE OR REPLACE FUNCTION public.set_my_payout_pix(p_type text, p_key text, p_consent boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_key text;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta' USING ERRCODE = '42501'; END IF;
    IF NOT COALESCE(p_consent, false) THEN
        RAISE EXCEPTION 'Autorize mostrar a chave à loja que for te pagar' USING ERRCODE = '22023', HINT = 'consent_required';
    END IF;
    v_key := public._pix_normalize(p_type, p_key);
    IF v_key IS NULL OR NOT public._pix_key_valid(p_type, v_key) THEN
        RAISE EXCEPTION 'Chave Pix inválida para o tipo escolhido' USING ERRCODE = '22023', HINT = 'invalid_pix';
    END IF;
    -- a chave não troca no meio de um pagamento em andamento
    IF EXISTS (SELECT 1 FROM public.order_delivery_dispatches d JOIN public.ride_requests r ON r.id = d.ride_request_id
                WHERE r.driver_id = v_uid AND d.flow_version = 2 AND d.status = 'accepted'
                  AND d.phase IN ('LOJA_INFORMOU_RECEBIMENTO', 'AGUARDANDO_PAGAMENTO_ENTREGADOR', 'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR', 'PAGAMENTO_EM_VERIFICACAO')) THEN
        RAISE EXCEPTION 'Você tem um pagamento de entrega em andamento: não dá para trocar a chave agora' USING ERRCODE = '42501', HINT = 'payment_in_progress';
    END IF;
    INSERT INTO public.driver_payout_keys (driver_id, pix_key_type, pix_key, consent_at, updated_at)
    VALUES (v_uid, p_type, v_key, now(), now())
    ON CONFLICT (driver_id) DO UPDATE SET pix_key_type = EXCLUDED.pix_key_type, pix_key = EXCLUDED.pix_key, consent_at = now(), updated_at = now();
    RETURN jsonb_build_object('registered', true, 'type', p_type, 'masked', public._pix_mask(p_type, v_key));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_payout_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'required', COALESCE((SELECT new_delivery_flow_enabled FROM public.delivery_dispatch_settings WHERE id), false),
        'registered', k.driver_id IS NOT NULL, 'type', k.pix_key_type,
        'masked', CASE WHEN k.driver_id IS NOT NULL THEN public._pix_mask(k.pix_key_type, k.pix_key) END)
      FROM (SELECT auth.uid() AS uid) u LEFT JOIN public.driver_payout_keys k ON k.driver_id = u.uid
$$;

-- ============================================================
-- 3. Fases de dinheiro
-- ============================================================
-- depois de "loja recebeu do cliente" até a entrega andar: cancelamento simples NÃO é possível (há dinheiro declarado)
CREATE OR REPLACE FUNCTION public._v2_phase_money(p_phase text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$ SELECT p_phase IN ('LOJA_INFORMOU_RECEBIMENTO', 'AGUARDANDO_PAGAMENTO_ENTREGADOR', 'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR', 'PAGAMENTO_EM_VERIFICACAO',
                          'ENTREGADOR_CONFIRMOU_RECEBIMENTO', 'ENTREGA_LIBERADA', 'A_CAMINHO_DA_LOJA', 'CHEGOU_NA_LOJA', 'PEDIDO_RETIRADO', 'A_CAMINHO_DO_CLIENTE') $$;

CREATE OR REPLACE FUNCTION public._v2_state_code(p_phase text, p_status text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_phase = 'PROCURANDO_ENTREGADOR' THEN 'searching'
        WHEN p_phase = 'AGUARDANDO_AUTORIZACAO_REAJUSTE' THEN 'awaiting_authorization'
        WHEN p_phase = 'ENTREGADOR_RESERVADO' THEN 'driver_reserved'
        WHEN p_phase = 'AGUARDANDO_PAGAMENTO_CLIENTE' THEN 'awaiting_payment'
        WHEN p_phase = 'LOJA_INFORMOU_RECEBIMENTO' THEN 'customer_payment_reported'
        WHEN p_phase = 'AGUARDANDO_PAGAMENTO_ENTREGADOR' THEN 'awaiting_driver_payment'
        WHEN p_phase = 'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR' THEN 'driver_payment_reported'
        WHEN p_phase = 'PAGAMENTO_EM_VERIFICACAO' THEN 'payment_in_verification'
        WHEN p_phase = 'ENTREGADOR_CONFIRMOU_RECEBIMENTO' THEN 'receipt_confirmed'
        WHEN p_phase = 'SEM_ENTREGADOR' THEN 'no_driver'
        WHEN p_phase = 'CANCELADO' THEN 'cancelled'
        WHEN public._v2_phase_released(p_phase) THEN 'released'
        ELSE lower(p_phase)
    END
$$;

-- ============================================================
-- 4. Janela financeira vencida: NUNCA volta à busca; abre ocorrência e vai para verificação
-- ============================================================
CREATE OR REPLACE FUNCTION public._v2_financial_timeout(p_dispatch uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE d public.order_delivery_dispatches; v_owner uuid; v_driver uuid;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch FOR UPDATE;
    IF NOT FOUND OR d.flow_version <> 2 OR d.status <> 'accepted'
       OR d.phase NOT IN ('LOJA_INFORMOU_RECEBIMENTO', 'AGUARDANDO_PAGAMENTO_ENTREGADOR', 'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR')
       OR d.reserved_until IS NULL OR now() < d.reserved_until THEN
        RETURN 'skip';
    END IF;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = d.store_id;
    SELECT driver_id INTO v_driver FROM public.ride_requests WHERE id = d.ride_request_id;
    PERFORM set_config('app.delivery_actor', 'system', true);
    UPDATE public.order_delivery_dispatches SET phase = 'PAGAMENTO_EM_VERIFICACAO', updated_at = now() WHERE id = d.id;
    INSERT INTO public.delivery_incidents (dispatch_id, order_id, ride_request_id, store_id, driver_id, kind, description, opened_by, opened_role)
    VALUES (d.id, d.order_id, d.ride_request_id, d.store_id, v_driver, 'operational',
            'O prazo do fluxo financeiro terminou sem a conclusão do pagamento ao entregador. Nada foi liberado nem devolvido automaticamente.', v_owner, 'system');
    INSERT INTO public.delivery_payment_events (dispatch_id, order_id, store_id, ride_request_id, driver_id, kind, amount, declared_by, declared_role, metadata)
    VALUES (d.id, d.order_id, d.store_id, d.ride_request_id, v_driver, 'sent_for_verification', d.frozen_freight, v_owner, 'system', jsonb_build_object('reason', 'financial_window_expired', 'from_phase', d.phase));
    INSERT INTO public.order_delivery_events (dispatch_id, kind, data)
    VALUES (d.id, 'reservation_notice', jsonb_build_object('reason', 'in_verification', 'driver_id', v_driver));
    RETURN 'timeout:verification';
END;
$$;

-- Job: busca (2.5) + reservas vencidas sem dinheiro (2.6) + janelas financeiras vencidas (2.7)
CREATE OR REPLACE FUNCTION public.process_delivery_search_v2()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; v_res text; v_n integer := 0;
BEGIN
    FOR r IN
        SELECT id FROM public.order_delivery_dispatches
         WHERE flow_version = 2 AND status = 'searching'
           AND (offer_expires_at IS NULL OR offer_expires_at <= now() OR phase = 'AGUARDANDO_AUTORIZACAO_REAJUSTE')
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            v_res := public._advance_delivery_search_v2(r.id);
            IF v_res LIKE 'round:%' OR v_res LIKE 'ended:%' OR v_res = 'asked' THEN v_n := v_n + 1; END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'busca V2 falhou na entrega %: %', r.id, SQLERRM;
        END;
    END LOOP;
    FOR r IN
        SELECT id FROM public.order_delivery_dispatches
         WHERE flow_version = 2 AND status = 'accepted' AND reserved_until <= now() AND reservation_released_at IS NULL
           AND phase IN ('ENTREGADOR_RESERVADO', 'AGUARDANDO_PAGAMENTO_CLIENTE')
         ORDER BY reserved_until
         FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            v_res := public._v2_expire_reservation(r.id);
            IF v_res LIKE 'expired:%' THEN v_n := v_n + 1; END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'reserva V2 falhou na entrega %: %', r.id, SQLERRM;
        END;
    END LOOP;
    FOR r IN
        SELECT id FROM public.order_delivery_dispatches
         WHERE flow_version = 2 AND status = 'accepted' AND reserved_until <= now()
           AND phase IN ('LOJA_INFORMOU_RECEBIMENTO', 'AGUARDANDO_PAGAMENTO_ENTREGADOR', 'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR')
         ORDER BY reserved_until
         FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            v_res := public._v2_financial_timeout(r.id);
            IF v_res LIKE 'timeout:%' THEN v_n := v_n + 1; END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'janela financeira V2 falhou na entrega %: %', r.id, SQLERRM;
        END;
    END LOOP;
    IF v_n > 0 THEN PERFORM public._ping_delivery_events(); END IF;
    RETURN v_n;
END;
$$;

-- ============================================================
-- 5. Declarações (todas SECURITY DEFINER, travam a entrega, validam tudo no servidor e são idempotentes)
-- ============================================================
-- LOJA: "recebi o pagamento do cliente"
CREATE OR REPLACE FUNCTION public.store_report_customer_payment(p_dispatch uuid, p_method text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    d public.order_delivery_dispatches;
    o public.orders;
    cfg public.delivery_dispatch_settings;
    v_owner uuid; v_driver uuid; v_method text;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch FOR UPDATE;
    IF NOT FOUND OR d.flow_version <> 2 THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = d.store_id;
    IF v_uid IS NULL OR v_owner IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.delivery_payment_events WHERE dispatch_id = d.id AND kind = 'store_declared_customer_payment') THEN
        RETURN jsonb_build_object('ok', true, 'duplicate', true, 'phase', d.phase);      -- clique repetido: nada novo
    END IF;
    IF d.status <> 'accepted' OR d.phase <> 'AGUARDANDO_PAGAMENTO_CLIENTE' THEN
        RAISE EXCEPTION 'Esta entrega não está aguardando o pagamento do cliente' USING ERRCODE = '22023', HINT = 'wrong_phase';
    END IF;
    IF d.reservation_released_at IS NOT NULL OR d.reserved_until IS NULL THEN
        RAISE EXCEPTION 'A reserva do entregador não está mais ativa' USING ERRCODE = '22023', HINT = 'reservation_inactive';
    END IF;
    -- a reserva venceu: processa a expiração ANTES de aceitar qualquer declaração (nunca "recebi" depois de liberar o motorista)
    IF now() >= d.reserved_until THEN
        PERFORM public._v2_expire_reservation(d.id);
        RETURN jsonb_build_object('ok', false, 'expired', true);
    END IF;
    SELECT * INTO o FROM public.orders WHERE id = d.order_id;
    IF d.frozen_freight IS NULL OR o.delivery_fee IS DISTINCT FROM d.frozen_freight THEN
        RAISE EXCEPTION 'O total definitivo do pedido não confere com o frete aceito' USING ERRCODE = '22023', HINT = 'total_mismatch';
    END IF;
    SELECT driver_id INTO v_driver FROM public.ride_requests WHERE id = d.ride_request_id;
    IF v_driver IS NULL THEN RAISE EXCEPTION 'A entrega não tem entregador reservado' USING ERRCODE = '22023', HINT = 'no_driver'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.driver_payout_keys WHERE driver_id = v_driver) THEN
        RAISE EXCEPTION 'O entregador ainda não tem chave Pix cadastrada' USING ERRCODE = '22023', HINT = 'driver_pix_missing';
    END IF;
    v_method := COALESCE(NULLIF(btrim(p_method), ''), o.payment_method, 'combinar');
    IF v_method NOT IN ('pix', 'dinheiro', 'cartao', 'combinar', 'outro') THEN v_method := 'outro'; END IF;
    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;

    INSERT INTO public.delivery_payment_events (dispatch_id, order_id, store_id, ride_request_id, driver_id, kind, amount, declared_by, declared_role, metadata)
    VALUES (d.id, d.order_id, d.store_id, d.ride_request_id, v_driver, 'store_declared_customer_payment', o.total_amount, v_uid, 'store',
            jsonb_build_object('method', v_method, 'declaratory', true));
    -- a janela agora é a financeira: reinicia o relógio (e daqui em diante NÃO volta sozinho à busca)
    PERFORM set_config('app.delivery_actor', 'store', true);
    UPDATE public.order_delivery_dispatches SET phase = 'LOJA_INFORMOU_RECEBIMENTO', reserved_until = now() + make_interval(mins => cfg.reservation_timeout_minutes), updated_at = now() WHERE id = d.id;
    PERFORM set_config('app.delivery_actor', 'system', true);
    UPDATE public.order_delivery_dispatches SET phase = 'AGUARDANDO_PAGAMENTO_ENTREGADOR', updated_at = now() WHERE id = d.id;
    RETURN jsonb_build_object('ok', true, 'phase', 'AGUARDANDO_PAGAMENTO_ENTREGADOR', 'amount_received', o.total_amount);
END;
$$;

-- LOJA: "enviei o frete ao motorista" (valor SEMPRE = frozen_freight; o parâmetro só serve para recusar divergência)
CREATE OR REPLACE FUNCTION public.store_report_driver_payment(p_dispatch uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    d public.order_delivery_dispatches;
    cfg public.delivery_dispatch_settings;
    k public.driver_payout_keys;
    v_owner uuid; v_driver uuid;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch FOR UPDATE;
    IF NOT FOUND OR d.flow_version <> 2 THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = d.store_id;
    IF v_uid IS NULL OR v_owner IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.delivery_payment_events WHERE dispatch_id = d.id AND kind = 'store_declared_driver_payment') THEN
        RETURN jsonb_build_object('ok', true, 'duplicate', true, 'phase', d.phase);
    END IF;
    IF d.status <> 'accepted' OR d.phase <> 'AGUARDANDO_PAGAMENTO_ENTREGADOR'
       OR NOT EXISTS (SELECT 1 FROM public.delivery_payment_events WHERE dispatch_id = d.id AND kind = 'store_declared_customer_payment') THEN
        RAISE EXCEPTION 'Esta entrega não está aguardando o pagamento ao entregador' USING ERRCODE = '22023', HINT = 'wrong_phase';
    END IF;
    IF d.reserved_until IS NULL OR now() >= d.reserved_until THEN
        PERFORM public._v2_financial_timeout(d.id);
        RETURN jsonb_build_object('ok', false, 'expired', true, 'in_verification', true);
    END IF;
    IF p_amount IS DISTINCT FROM d.frozen_freight THEN
        RAISE EXCEPTION 'O valor a pagar ao entregador é R$ %', to_char(d.frozen_freight, 'FM999990D00') USING ERRCODE = '22023', HINT = 'amount_mismatch';
    END IF;
    SELECT driver_id INTO v_driver FROM public.ride_requests WHERE id = d.ride_request_id;
    SELECT * INTO k FROM public.driver_payout_keys WHERE driver_id = v_driver;
    IF v_driver IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'O entregador não tem chave Pix cadastrada' USING ERRCODE = '22023', HINT = 'driver_pix_missing'; END IF;
    SELECT * INTO cfg FROM public.delivery_dispatch_settings WHERE id;

    INSERT INTO public.delivery_payment_events (dispatch_id, order_id, store_id, ride_request_id, driver_id, kind, amount, declared_by, declared_role, metadata)
    VALUES (d.id, d.order_id, d.store_id, d.ride_request_id, v_driver, 'store_declared_driver_payment', d.frozen_freight, v_uid, 'store',
            jsonb_build_object('pix_key_type', k.pix_key_type, 'declaratory', true));
    PERFORM set_config('app.delivery_actor', 'store', true);
    UPDATE public.order_delivery_dispatches
       SET phase = 'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR', reserved_until = now() + make_interval(mins => cfg.reservation_timeout_minutes), updated_at = now()
     WHERE id = d.id;
    INSERT INTO public.order_delivery_events (dispatch_id, kind, data)
    VALUES (d.id, 'reservation_notice', jsonb_build_object('reason', 'driver_payment_reported', 'driver_id', v_driver, 'amount', d.frozen_freight));
    PERFORM public._ping_delivery_events();
    RETURN jsonb_build_object('ok', true, 'phase', 'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR', 'amount_declared', d.frozen_freight);
END;
$$;

-- MOTORISTA: "recebi" (libera a entrega) ou "não recebi" (vai para verificação; nada é decidido sozinho)
CREATE OR REPLACE FUNCTION public.driver_report_receipt(p_dispatch uuid, p_received boolean, p_amount numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    d public.order_delivery_dispatches;
    v_driver uuid; v_owner uuid;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch FOR UPDATE;
    IF NOT FOUND OR d.flow_version <> 2 THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT driver_id INTO v_driver FROM public.ride_requests WHERE id = d.ride_request_id;
    IF v_uid IS NULL OR v_driver IS DISTINCT FROM v_uid OR d.status <> 'accepted' THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.delivery_payment_events WHERE dispatch_id = d.id AND kind = 'store_declared_driver_payment') THEN
        RAISE EXCEPTION 'A loja ainda não informou o envio do pagamento' USING ERRCODE = '22023', HINT = 'store_not_reported';
    END IF;

    IF COALESCE(p_received, false) THEN
        IF EXISTS (SELECT 1 FROM public.delivery_payment_events WHERE dispatch_id = d.id AND kind = 'driver_confirmed_receipt') THEN
            RETURN jsonb_build_object('ok', true, 'duplicate', true, 'phase', d.phase);
        END IF;
        IF d.phase NOT IN ('LOJA_INFORMOU_PAGAMENTO_ENTREGADOR', 'PAGAMENTO_EM_VERIFICACAO') THEN
            RAISE EXCEPTION 'Esta entrega não está aguardando a sua confirmação' USING ERRCODE = '22023', HINT = 'wrong_phase';
        END IF;
        IF p_amount IS NOT NULL AND p_amount IS DISTINCT FROM d.frozen_freight THEN
            RAISE EXCEPTION 'O valor declarado pela loja é R$ %', to_char(d.frozen_freight, 'FM999990D00') USING ERRCODE = '22023', HINT = 'amount_mismatch';
        END IF;
        INSERT INTO public.delivery_payment_events (dispatch_id, order_id, store_id, ride_request_id, driver_id, kind, amount, declared_by, declared_role, metadata)
        VALUES (d.id, d.order_id, d.store_id, d.ride_request_id, v_driver, 'driver_confirmed_receipt', d.frozen_freight, v_uid, 'driver',
                jsonb_build_object('from_phase', d.phase, 'declaratory', true));
        PERFORM set_config('app.delivery_actor', 'driver', true);
        UPDATE public.order_delivery_dispatches SET phase = 'ENTREGADOR_CONFIRMOU_RECEBIMENTO', updated_at = now() WHERE id = d.id;
        PERFORM set_config('app.delivery_actor', 'system', true);
        UPDATE public.order_delivery_dispatches SET phase = 'ENTREGA_LIBERADA', updated_at = now() WHERE id = d.id;      -- só aqui a barreira da 2.6 abre
        UPDATE public.delivery_incidents SET status = 'resolved', resolution = 'O entregador confirmou o recebimento.', resolved_by = v_uid, resolved_at = now(), updated_at = now()
         WHERE dispatch_id = d.id AND status IN ('open', 'under_review') AND kind IN ('driver_not_received', 'operational');
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = d.store_id;
        INSERT INTO public.order_delivery_events (dispatch_id, kind, data) VALUES (d.id, 'reservation_notice', jsonb_build_object('reason', 'released', 'driver_id', v_driver));
        PERFORM public._ping_delivery_events();
        RETURN jsonb_build_object('ok', true, 'phase', 'ENTREGA_LIBERADA');
    END IF;

    -- "não recebi"
    IF EXISTS (SELECT 1 FROM public.delivery_payment_events WHERE dispatch_id = d.id AND kind = 'driver_declared_not_received') THEN
        RETURN jsonb_build_object('ok', true, 'duplicate', true, 'phase', d.phase);
    END IF;
    IF EXISTS (SELECT 1 FROM public.delivery_payment_events WHERE dispatch_id = d.id AND kind = 'driver_confirmed_receipt') OR d.phase <> 'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR' THEN
        RAISE EXCEPTION 'Esta entrega não está aguardando a sua confirmação' USING ERRCODE = '22023', HINT = 'wrong_phase';
    END IF;
    INSERT INTO public.delivery_payment_events (dispatch_id, order_id, store_id, ride_request_id, driver_id, kind, amount, declared_by, declared_role, metadata)
    VALUES (d.id, d.order_id, d.store_id, d.ride_request_id, v_driver, 'driver_declared_not_received', d.frozen_freight, v_uid, 'driver', jsonb_build_object('declaratory', true));
    PERFORM set_config('app.delivery_actor', 'driver', true);
    UPDATE public.order_delivery_dispatches SET phase = 'PAGAMENTO_EM_VERIFICACAO', updated_at = now() WHERE id = d.id;
    INSERT INTO public.delivery_incidents (dispatch_id, order_id, ride_request_id, store_id, driver_id, kind, description, opened_by, opened_role)
    VALUES (d.id, d.order_id, d.ride_request_id, d.store_id, v_driver, 'driver_not_received',
            'O entregador informou que NÃO recebeu o pagamento do frete declarado pela loja. Nada foi decidido automaticamente.', v_uid, 'driver');
    INSERT INTO public.order_delivery_events (dispatch_id, kind, data) VALUES (d.id, 'reservation_notice', jsonb_build_object('reason', 'in_verification', 'driver_id', v_driver));
    PERFORM public._ping_delivery_events();
    RETURN jsonb_build_object('ok', true, 'phase', 'PAGAMENTO_EM_VERIFICACAO');
END;
$$;

-- Qualquer parte da entrega abre uma ocorrência (não muda fase nem dinheiro): é por aqui que se contesta cancelamento depois de dinheiro declarado
CREATE OR REPLACE FUNCTION public.open_delivery_incident(p_dispatch uuid, p_kind text, p_description text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); d public.order_delivery_dispatches; v_role text; v_driver uuid; v_owner uuid; v_id uuid;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch;
    IF NOT FOUND OR d.flow_version <> 2 OR v_uid IS NULL THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = d.store_id;
    SELECT driver_id INTO v_driver FROM public.ride_requests WHERE id = d.ride_request_id;
    v_role := CASE WHEN v_uid = v_owner THEN 'store' WHEN v_uid = v_driver THEN 'driver' WHEN v_uid = d.customer_id THEN 'customer' END;
    IF v_role IS NULL THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF p_kind NOT IN ('divergence', 'cancellation_contested', 'operational', 'other') THEN RAISE EXCEPTION 'Tipo de ocorrência inválido' USING ERRCODE = '22023'; END IF;
    IF p_description IS NULL OR char_length(btrim(p_description)) < 3 OR char_length(p_description) > 2000 THEN RAISE EXCEPTION 'Descreva o problema (3 a 2000 caracteres)' USING ERRCODE = '22023'; END IF;
    SELECT id INTO v_id FROM public.delivery_incidents WHERE dispatch_id = d.id AND opened_by = v_uid AND kind = p_kind AND status IN ('open', 'under_review');
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;                      -- idempotente: já existe uma aberta igual
    INSERT INTO public.delivery_incidents (dispatch_id, order_id, ride_request_id, store_id, driver_id, kind, description, opened_by, opened_role)
    VALUES (d.id, d.order_id, d.ride_request_id, d.store_id, v_driver, p_kind, btrim(p_description), v_uid, v_role) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ============================================================
-- 6. Leitura segura por papel (cliente / loja / motorista)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_delivery_payment_view(p_dispatch uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    d public.order_delivery_dispatches; o public.orders; s public.stores; k public.driver_payout_keys; drv jsonb;
    v_role text; v_driver uuid;
    e_cust boolean; e_store boolean; e_conf boolean; e_deny boolean; v_incident boolean;
    out jsonb;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch;
    IF NOT FOUND OR d.flow_version <> 2 OR v_uid IS NULL THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO s FROM public.stores WHERE id = d.store_id;
    SELECT * INTO o FROM public.orders WHERE id = d.order_id;
    SELECT driver_id INTO v_driver FROM public.ride_requests WHERE id = d.ride_request_id;
    v_role := CASE WHEN v_uid = s.owner_id THEN 'store' WHEN v_uid = d.customer_id THEN 'customer' WHEN v_uid = v_driver AND d.status = 'accepted' THEN 'driver' END;
    IF v_role IS NULL THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;

    SELECT bool_or(kind = 'store_declared_customer_payment'), bool_or(kind = 'store_declared_driver_payment'),
           bool_or(kind = 'driver_confirmed_receipt'), bool_or(kind = 'driver_declared_not_received')
      INTO e_cust, e_store, e_conf, e_deny FROM public.delivery_payment_events WHERE dispatch_id = d.id;
    v_incident := EXISTS (SELECT 1 FROM public.delivery_incidents WHERE dispatch_id = d.id AND status IN ('open', 'under_review'));
    out := jsonb_build_object(
        'role', v_role, 'phase', d.phase, 'state', public._v2_state_code(d.phase, d.status),
        'frozen_freight', d.frozen_freight, 'estimated_freight', d.estimated_freight,
        'items_total', o.total_amount - COALESCE(o.delivery_fee, 0), 'delivery_fee', o.delivery_fee, 'total_amount', o.total_amount,
        'reserved_until', CASE WHEN d.reservation_released_at IS NULL THEN d.reserved_until END,
        'customer_payment_reported', COALESCE(e_cust, false), 'driver_payment_reported', COALESCE(e_store, false),
        'driver_confirmed', COALESCE(e_conf, false), 'driver_denied', COALESCE(e_deny, false), 'open_incident', v_incident);

    IF v_role = 'customer' THEN
        -- instruções para pagar a LOJA (nunca o Pix do motorista)
        out := out || jsonb_build_object('store', jsonb_build_object(
            'name', s.name, 'accepts_pix', COALESCE(s.accepts_pix, false), 'accepts_card', COALESCE(s.accepts_card, false), 'accepts_cash', COALESCE(s.accepts_cash, false),
            'pix_key_type', CASE WHEN d.phase = 'AGUARDANDO_PAGAMENTO_CLIENTE' AND COALESCE(s.accepts_pix, false) THEN s.pix_key_type END,
            'pix_key', CASE WHEN d.phase = 'AGUARDANDO_PAGAMENTO_CLIENTE' AND COALESCE(s.accepts_pix, false) THEN s.pix_key END));
    ELSIF v_role = 'store' THEN
        SELECT jsonb_build_object('slug', p."profileSlug", 'name', p.name) INTO drv FROM public.profiles p WHERE p.id = v_driver;
        SELECT * INTO k FROM public.driver_payout_keys WHERE driver_id = v_driver;
        out := out || jsonb_build_object('driver', drv, 'amount_to_pay_driver', d.frozen_freight,
            -- a chave do motorista só aparece quando a loja já declarou receber do cliente (hora de pagar o frete)
            'driver_pix_type', CASE WHEN d.phase IN ('AGUARDANDO_PAGAMENTO_ENTREGADOR', 'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR', 'PAGAMENTO_EM_VERIFICACAO') THEN k.pix_key_type END,
            'driver_pix_key', CASE WHEN d.phase IN ('AGUARDANDO_PAGAMENTO_ENTREGADOR', 'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR', 'PAGAMENTO_EM_VERIFICACAO') THEN k.pix_key END);
    ELSE
        out := out || jsonb_build_object('amount_to_receive', d.frozen_freight,
            'can_respond', d.phase IN ('LOJA_INFORMOU_PAGAMENTO_ENTREGADOR') OR (d.phase = 'PAGAMENTO_EM_VERIFICACAO' AND COALESCE(e_store, false) AND NOT COALESCE(e_conf, false)));
        out := out - 'items_total' - 'delivery_fee' - 'total_amount';           -- o motorista não precisa do total do pedido
    END IF;
    RETURN out;
END;
$$;

-- ============================================================
-- 7. Quem NÃO tem Pix não aceita entrega V2; cancelamentos depois de dinheiro declarado
-- ============================================================

-- Candidatura V2: exige chave Pix do motorista (o resto igual à 2.5)
CREATE OR REPLACE FUNCTION public.ride_applications_v2_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d public.order_delivery_dispatches; v_status text; v_price numeric;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = NEW.ride_request_id AND flow_version = 2 FOR UPDATE;
    IF NOT FOUND THEN RETURN NEW; END IF;                       -- entrega V1: nada muda
    IF d.status <> 'searching' THEN RETURN NEW; END IF;         -- já decidida: os gatilhos existentes rejeitam a candidatura
    SELECT status, offered_price INTO v_status, v_price FROM public.ride_requests WHERE id = NEW.ride_request_id;
    IF v_status IS DISTINCT FROM 'pending' THEN RETURN NEW; END IF;
    -- sem chave Pix cadastrada o motorista não aceita: a loja nunca recebe do cliente para depois não conseguir pagar o frete
    IF NOT EXISTS (SELECT 1 FROM public.driver_payout_keys WHERE driver_id = NEW.applicant_id) THEN
        RAISE EXCEPTION 'Cadastre sua chave Pix para aceitar entregas do novo fluxo' USING ERRCODE = '42501', HINT = 'payout_pix_required';
    END IF;
    IF d.offer_expires_at IS NULL OR now() >= d.offer_expires_at THEN
        RAISE EXCEPTION 'Esta oferta expirou' USING ERRCODE = '42501', HINT = 'offer_expired';
    END IF;
    IF NEW.proposed_price IS DISTINCT FROM d.final_freight OR v_price IS DISTINCT FROM d.final_freight THEN
        RAISE EXCEPTION 'O valor da oferta mudou. Veja o valor atual.' USING ERRCODE = '42501', HINT = 'offer_changed';
    END IF;
    IF d.price_limit IS NULL OR d.final_freight > d.price_limit THEN
        RAISE EXCEPTION 'Valor acima do autorizado pelo cliente' USING ERRCODE = '42501', HINT = 'above_authorized';
    END IF;
    RETURN NEW;
END;
$function$;

-- Barreira: além de bloquear passo operacional antes da liberação, bloqueia cancelar a corrida depois de dinheiro declarado
CREATE OR REPLACE FUNCTION public.ride_requests_v2_barrier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; v_reserved boolean; v_allowed boolean;
BEGIN
    IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
    SELECT id, phase, status INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = NEW.id AND flow_version = 2;
    IF NOT FOUND THEN RETURN NEW; END IF;                        -- V1 e corridas comuns: nada muda
    v_reserved := d.status = 'accepted' AND d.phase IN ('ENTREGADOR_RESERVADO', 'AGUARDANDO_PAGAMENTO_CLIENTE');

    IF v_reserved AND OLD.status = 'accepted' AND NEW.status = 'cancelled' THEN
        IF NEW.cancelled_by = 'driver' THEN
            SELECT cancel_driver_after_reservation INTO v_allowed FROM public.delivery_dispatch_settings WHERE id;
            IF NOT v_allowed THEN
                RAISE EXCEPTION 'O entregador não pode cancelar depois da reserva' USING ERRCODE = '42501', HINT = 'cancel_not_allowed';
            END IF;
        END IF;
        RETURN NEW;                                              -- a liberação é feita pelo gatilho DEPOIS (a política de segurança confere a linha final)
    END IF;

    -- dinheiro já declarado (ou entrega liberada): cancelar a corrida não é cancelamento simples → bloqueado; abra uma ocorrência
    IF OLD.status = 'accepted' AND NEW.status = 'cancelled' AND public._v2_phase_money(d.phase) THEN
        RAISE EXCEPTION 'Há pagamento informado nesta entrega: o cancelamento simples não é possível. Abra uma ocorrência.' USING ERRCODE = '42501', HINT = 'cancel_blocked_after_payment';
    END IF;

    IF NOT public._v2_phase_released(d.phase)
       AND ((NEW.driver_en_route, NEW.driver_departed_at, NEW.driver_arrived_at, NEW.ride_started_at, NEW.stop1_reached_at, NEW.stop2_reached_at,
             NEW.extra_task_minutes, NEW.extra_task_fee, NEW.extra_task_description)
            IS DISTINCT FROM
            (OLD.driver_en_route, OLD.driver_departed_at, OLD.driver_arrived_at, OLD.ride_started_at, OLD.stop1_reached_at, OLD.stop2_reached_at,
             OLD.extra_task_minutes, OLD.extra_task_fee, OLD.extra_task_description)
            OR (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')) THEN
        RAISE EXCEPTION 'Aguarde a liberação da entrega antes de iniciar a retirada' USING ERRCODE = '42501', HINT = 'delivery_not_released';
    END IF;
    RETURN NEW;
END;
$function$;

-- Cancelamento do cliente: bloqueado depois de dinheiro declarado (2.6 continua valendo antes)
CREATE OR REPLACE FUNCTION public.cancel_order_delivery(p_dispatch uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    d public.order_delivery_dispatches;
BEGIN
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE id = p_dispatch FOR UPDATE;
    IF NOT FOUND OR d.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
    -- V2 com motorista reservado e ainda sem pagamento: o cliente pode cancelar se o admin permitir; o motorista é liberado e não nasce cobrança
    IF d.flow_version = 2 AND d.status = 'accepted' AND d.phase IN ('ENTREGADOR_RESERVADO', 'AGUARDANDO_PAGAMENTO_CLIENTE') THEN
        IF NOT (SELECT cancel_customer_during_reservation FROM public.delivery_dispatch_settings WHERE id) THEN
            RAISE EXCEPTION 'O cancelamento durante a reserva não está liberado' USING ERRCODE = '42501';
        END IF;
        PERFORM public._v2_release_reservation(d.id, 'customer_cancelled', 'cancel');
        RETURN;
    END IF;
    IF d.flow_version = 2 AND d.status = 'accepted' AND public._v2_phase_money(d.phase) THEN
        RAISE EXCEPTION 'Há pagamento informado nesta entrega: o cancelamento simples não é possível. Abra uma ocorrência.' USING ERRCODE = '42501', HINT = 'cancel_blocked_after_payment';
    END IF;
    IF d.status <> 'searching' THEN RAISE EXCEPTION 'A entrega já tem motorista ou foi encerrada'; END IF;
    UPDATE public.ride_requests SET status = 'cancelled', cancelled_by = 'requester' WHERE id = d.ride_request_id AND status = 'pending';
    UPDATE public.order_delivery_rounds SET status = 'expired' WHERE dispatch_id = d.id AND status = 'pending_customer';
    UPDATE public.order_delivery_dispatches SET status = 'cancelled', updated_at = now() WHERE id = d.id;
END;
$function$;

-- Leitura do motorista: agora devolve a entrega (para ele confirmar o recebimento) e o estado
CREATE OR REPLACE FUNCTION public.get_driver_delivery_gate(p_ride uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.ride_requests; d public.order_delivery_dispatches;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride;
    IF NOT FOUND OR auth.uid() IS NULL OR r.driver_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO d FROM public.order_delivery_dispatches WHERE ride_request_id = p_ride;
    IF NOT FOUND OR d.flow_version <> 2 THEN RETURN jsonb_build_object('v2', false, 'released', true); END IF;
    RETURN jsonb_build_object('v2', true, 'dispatch_id', d.id, 'phase', d.phase, 'state', public._v2_state_code(d.phase, d.status),
                              'released', public._v2_phase_released(d.phase),
                              'reserved_until', CASE WHEN d.reservation_released_at IS NULL THEN d.reserved_until END,
                              'frozen_freight', d.frozen_freight);
END;
$function$;


-- ============================================================
-- 8. Permissões
-- ============================================================
REVOKE ALL ON FUNCTION public._pix_normalize(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._pix_key_valid(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._pix_mask(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._v2_phase_money(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._v2_financial_timeout(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_delivery_search_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_my_payout_pix(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_payout_pix(text, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_payout_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_payout_status() TO authenticated;
REVOKE ALL ON FUNCTION public.store_report_customer_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_report_customer_payment(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.store_report_driver_payment(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_report_driver_payment(uuid, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.driver_report_receipt(uuid, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_report_receipt(uuid, boolean, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.open_delivery_incident(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_delivery_incident(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_delivery_payment_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_delivery_payment_view(uuid) TO authenticated;
