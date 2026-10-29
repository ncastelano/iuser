-- CAIXA DO ENTREGADOR (dinheiro e maquininha) + CONTESTAÇÃO DE ENTREGA — o iUser NÃO movimenta esse dinheiro: só registra o que cada um DECLARA e trava quem não se regulariza.
--
-- DINHEIRO na porta (pedido pago em dinheiro): o entregador recebe o total do cliente, FICA com o frete (offered_price) e repassa à LOJA o valor dos produtos
--   (store_dues kind 'cash'). Repasse por Pix na chave da loja ou em mãos; a loja confirma "recebi" (ou diz "não recebi" → contestado → o admin decide).
-- MAQUININHA (pedido pago no cartão na entrega): a máquina é da LOJA — o dinheiro cai direto na conta dela, nada passa pelo entregador nem pelo iUser. O iUser só controla o
--   EQUIPAMENTO: ao retirar um pedido de cartão abre-se "maquininha com o entregador" (kind 'machine'); depois da última entrega de cartão o entregador tem 3 h para devolver
--   e a loja confirma que recebeu de volta.
-- Quem não repassa/devolve é BARRADO de aceitar novas entregas de loja (guard_ride_applications_insert → HINT cash_overdue | cash_limit | machine_overdue | dues_disputed |
--   dispute_strikes). Limites em delivery_dues_settings (sem tela no Admin ainda; alterar por SQL/migration).
-- CONTESTAÇÃO: o cliente diz "não recebi" em até 24 h depois da entrega, MESMO com a prova. O servidor guarda as EVIDÊNCIAS (prova, hora, distância na conclusão), loja e
--   entregador respondem, e o ADMIN decide (Admin → Disputas): rejeitada (a prova vale) | culpa do entregador (a loja reembolsa o cliente e o entregador deve o valor dos produtos
--   à loja — vira dívida no caixa dele; 3 culpas em 30 dias barram) | culpa da loja (a loja reembolsa) | reenviar. O reembolso é entre loja e cliente (declarado e confirmado).
-- Rollback: supabase/rollbacks/delivery_dues_disputes_rollback.sql

-- ===== avisos =====
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup', 'service_application',
    'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review',
    'customer_review', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered', 'delivery_driver_assigned',
    'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready', 'delivery_completed', 'delivery_done',
    'delivery_driver_cancelled', 'delivery_cancelled', 'delivery_at_door', 'delivery_message', 'delivery_issue',
    'favorite_invite', 'favorite_accepted', 'favorite_declined',
    'dues_update', 'dispute_update'
]));

-- os dois tipos novos também viram push (mesma lista do gatilho da 20261130000010)
CREATE OR REPLACE FUNCTION public.trg_ping_live_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.kind = ANY (ARRAY[
        'delivery_driver_assigned', 'delivery_picked_up', 'delivery_at_door', 'delivery_message', 'delivery_issue',
        'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_driver_cancelled', 'delivery_cancelled',
        'delivery_order_ready', 'delivery_completed',
        'favorite_invite', 'favorite_accepted', 'favorite_declined',
        'dues_update', 'dispute_update'
    ]) THEN
        PERFORM public._ping_delivery_events();
    END IF;
    RETURN NEW;
END; $$;

-- ===== regras (uma linha só; sem acesso do app) =====
CREATE TABLE IF NOT EXISTS public.delivery_dues_settings (
    id                   boolean PRIMARY KEY DEFAULT true CHECK (id),
    cash_max_open        numeric NOT NULL DEFAULT 300 CHECK (cash_max_open > 0),          -- quanto dinheiro de loja o entregador pode segurar sem repassar
    cash_due_hours       integer NOT NULL DEFAULT 24 CHECK (cash_due_hours BETWEEN 1 AND 168),
    machine_due_hours    integer NOT NULL DEFAULT 3 CHECK (machine_due_hours BETWEEN 1 AND 48),
    dispute_window_hours integer NOT NULL DEFAULT 24 CHECK (dispute_window_hours BETWEEN 1 AND 168),
    debt_due_hours       integer NOT NULL DEFAULT 72 CHECK (debt_due_hours BETWEEN 1 AND 336),
    strike_limit         integer NOT NULL DEFAULT 3 CHECK (strike_limit >= 1),            -- culpas em disputas que barram o entregador
    strike_days          integer NOT NULL DEFAULT 30 CHECK (strike_days >= 1),
    abuse_limit          integer NOT NULL DEFAULT 3 CHECK (abuse_limit >= 1),            -- contestações recusadas que travam o cliente
    abuse_days           integer NOT NULL DEFAULT 90 CHECK (abuse_days >= 1)
);
INSERT INTO public.delivery_dues_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.delivery_dues_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_dues_settings FROM anon, authenticated;
GRANT ALL ON public.delivery_dues_settings TO service_role;

-- ===== pendências do entregador com a loja =====
CREATE TABLE IF NOT EXISTS public.store_dues (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind           text NOT NULL CHECK (kind IN ('cash', 'machine', 'dispute_debt')),
    store_id       uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    driver_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_id       uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    ride_id        uuid REFERENCES public.ride_requests(id) ON DELETE SET NULL,
    amount         numeric CHECK (amount > 0),              -- quanto repassar (cash/dispute_debt); a maquininha não tem valor
    collected      numeric,                                  -- cash: o que o cliente pagou na porta
    status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'declared', 'confirmed', 'disputed', 'waived')),
    due_at         timestamptz,
    declare_method text CHECK (declare_method IN ('pix', 'em_maos', 'devolvida')),
    declared_at    timestamptz,
    confirmed_at   timestamptz,
    note           text CHECK (note IS NULL OR char_length(note) <= 500),
    decided_by     uuid,
    decided_at     timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind = 'machine') = (amount IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS store_dues_cash_once ON public.store_dues (ride_id) WHERE kind = 'cash';
CREATE UNIQUE INDEX IF NOT EXISTS store_dues_debt_once ON public.store_dues (order_id) WHERE kind = 'dispute_debt';
CREATE UNIQUE INDEX IF NOT EXISTS store_dues_machine_once ON public.store_dues (store_id, driver_id) WHERE kind = 'machine' AND status IN ('open', 'declared', 'disputed');
CREATE INDEX IF NOT EXISTS store_dues_driver_idx ON public.store_dues (driver_id, status);
CREATE INDEX IF NOT EXISTS store_dues_store_idx ON public.store_dues (store_id, status);
ALTER TABLE public.store_dues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_dues FROM anon, authenticated;
GRANT ALL ON public.store_dues TO service_role;

-- ===== contestações =====
CREATE TABLE IF NOT EXISTS public.delivery_disputes (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    ride_id             uuid REFERENCES public.ride_requests(id) ON DELETE SET NULL,
    store_id            uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    driver_id           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    customer_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason              text NOT NULL CHECK (reason IN ('not_received', 'incomplete', 'other')),
    note                text CHECK (note IS NULL OR char_length(note) <= 400),
    status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'decided')),
    evidence            jsonb NOT NULL DEFAULT '{}'::jsonb,
    store_reply         text CHECK (store_reply IS NULL OR char_length(store_reply) <= 400),
    driver_reply        text CHECK (driver_reply IS NULL OR char_length(driver_reply) <= 400),
    outcome             text CHECK (outcome IN ('rejected', 'driver_at_fault', 'store_at_fault', 'redelivery')),
    decision_note       text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
    decided_by          uuid,
    decided_at          timestamptz,
    refund_amount       numeric,
    refund_status       text NOT NULL DEFAULT 'none' CHECK (refund_status IN ('none', 'pending', 'declared', 'confirmed')),
    refund_method       text CHECK (refund_method IN ('pix', 'dinheiro', 'cartao', 'outro')),
    refund_contested    boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CHECK ((status = 'decided') = (outcome IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS delivery_disputes_driver_idx ON public.delivery_disputes (driver_id, outcome, decided_at);
CREATE INDEX IF NOT EXISTS delivery_disputes_customer_idx ON public.delivery_disputes (customer_id, outcome, decided_at);
ALTER TABLE public.delivery_disputes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_disputes FROM anon, authenticated;
GRANT ALL ON public.delivery_disputes TO service_role;

-- a conclusão registra QUANDO e a que distância do endereço (evidência de uma contestação)
ALTER TABLE public.delivery_proofs ADD COLUMN IF NOT EXISTS done_at timestamptz;
ALTER TABLE public.delivery_proofs ADD COLUMN IF NOT EXISTS done_dist_m integer;

CREATE OR REPLACE FUNCTION public.complete_ride(p_ride uuid, p_lat double precision, p_lng double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r public.ride_requests;
    v_m numeric;
BEGIN
    SELECT * INTO r FROM public.ride_requests WHERE id = p_ride FOR UPDATE;
    IF NOT FOUND OR r.driver_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF r.status <> 'accepted' THEN RAISE EXCEPTION 'Essa corrida não está em andamento'; END IF;
    IF r.ride_started_at IS NULL THEN RAISE EXCEPTION 'Inicie a corrida antes de concluir.'; END IF;
    IF r.order_id IS NOT NULL AND r.arrived_destination_at IS NULL THEN
        RAISE EXCEPTION 'Toque em "Estou no local" para avisar o cliente antes de concluir a entrega.' USING HINT = 'arrival_required';
    END IF;
    IF r.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.delivery_proofs WHERE ride_id = p_ride AND method IS NOT NULL) THEN
        RAISE EXCEPTION 'Confirme a entrega com o código do cliente (ou com a foto) antes de concluir.' USING HINT = 'proof_required';
    END IF;
    IF r.destination_lat IS NULL OR r.destination_lng IS NULL THEN
        RAISE EXCEPTION 'Não dá pra confirmar a chegada: esse pedido não tem coordenadas de destino.';
    END IF;
    IF p_lat IS NULL OR p_lng IS NULL THEN RAISE EXCEPTION 'Não conseguimos confirmar sua localização.'; END IF;
    v_m := public.haversine_km(r.destination_lat, r.destination_lng, p_lat, p_lng) * 1000;
    IF v_m > 100 THEN
        RAISE EXCEPTION 'Você está a % m do destino. Chegue a até 100 m pra concluir.', round(v_m);
    END IF;
    IF r.order_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.orders WHERE id = r.order_id AND status = 'rejected') THEN
        RAISE EXCEPTION 'O pedido desta entrega foi recusado';
    END IF;
    UPDATE public.ride_requests SET status = 'completed' WHERE id = p_ride AND status = 'accepted';
    IF r.order_id IS NOT NULL THEN
        UPDATE public.delivery_proofs SET done_at = now(), done_dist_m = round(v_m)::int WHERE ride_id = p_ride;
    END IF;
    RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ===== utilitários =====
CREATE OR REPLACE FUNCTION public._brl(n numeric) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'R$ ' || replace(to_char(COALESCE(n, 0), 'FM999999990.00'), '.', ',') $$;

-- quem pode ficar sem aceitar entrega de loja, e por quê (NULL = liberado)
CREATE OR REPLACE FUNCTION public._driver_dues_block(p_driver uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg public.delivery_dues_settings; v_open numeric;
BEGIN
    SELECT * INTO cfg FROM public.delivery_dues_settings WHERE id;
    IF EXISTS (SELECT 1 FROM public.store_dues WHERE driver_id = p_driver AND status = 'disputed') THEN RETURN 'dues_disputed'; END IF;
    IF EXISTS (SELECT 1 FROM public.store_dues WHERE driver_id = p_driver AND kind IN ('cash', 'dispute_debt') AND status = 'open' AND due_at < now()) THEN RETURN 'cash_overdue'; END IF;
    IF EXISTS (SELECT 1 FROM public.store_dues WHERE driver_id = p_driver AND kind = 'machine' AND status = 'open' AND due_at < now()) THEN RETURN 'machine_overdue'; END IF;
    SELECT COALESCE(sum(amount), 0) INTO v_open FROM public.store_dues WHERE driver_id = p_driver AND kind IN ('cash', 'dispute_debt') AND status = 'open';
    IF v_open >= cfg.cash_max_open THEN RETURN 'cash_limit'; END IF;
    IF (SELECT count(*) FROM public.delivery_disputes WHERE driver_id = p_driver AND outcome = 'driver_at_fault' AND decided_at > now() - make_interval(days => cfg.strike_days)) >= cfg.strike_limit THEN RETURN 'dispute_strikes'; END IF;
    RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public._driver_dues_block(uuid) FROM PUBLIC, anon, authenticated;

-- o gatilho de candidatura roda como o motorista: só enxerga a PRÓPRIA situação (nunca a de outro)
CREATE OR REPLACE FUNCTION public._dues_block_for_me(p_driver uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_driver IS DISTINCT FROM auth.uid() THEN RETURN NULL; END IF;
    RETURN public._driver_dues_block(p_driver);
END; $$;
REVOKE ALL ON FUNCTION public._dues_block_for_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._dues_block_for_me(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._dues_block_message(p_reason text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_reason
        WHEN 'cash_overdue' THEN 'Você tem um repasse à loja vencido. Regularize no Caixa para aceitar novas entregas.'
        WHEN 'cash_limit' THEN 'Você está com muito dinheiro de loja sem repassar. Repasse no Caixa para aceitar novas entregas.'
        WHEN 'machine_overdue' THEN 'Você ainda está com a maquininha de uma loja. Devolva-a para aceitar novas entregas.'
        WHEN 'dues_disputed' THEN 'Uma loja contestou um repasse seu. Resolva no Caixa para aceitar novas entregas.'
        WHEN 'dispute_strikes' THEN 'Você teve várias entregas contestadas com culpa. Fale com o suporte para voltar a aceitar entregas.'
        ELSE 'Você tem pendências com lojas.' END
$$;

CREATE OR REPLACE FUNCTION public._store_slug_path(p_store uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT '/painel-loja/' || "storeSlug" FROM public.stores WHERE id = p_store
$$;

-- ===== a regra de aceitar passa a conferir as pendências =====
CREATE OR REPLACE FUNCTION public.guard_ride_applications_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_offered numeric;
    v_order uuid;
    v_active integer;
    v_cap integer;
    v_units numeric;
    v_cap_units numeric;
    v_new_units numeric;
    v_block text;
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF NEW.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Candidatura nova começa pendente' USING ERRCODE = '42501';
    END IF;
    IF NEW.proposed_price IS NOT NULL AND (NEW.proposed_price <= 0 OR NEW.proposed_price > 100000) THEN
        RAISE EXCEPTION 'Valor inválido' USING ERRCODE = '42501';
    END IF;
    -- Janela dos FAVORITOS: durante ela só os favoritos aceitos da loja podem aceitar (antes de qualquer leitura de ride_offers, que a política esconde dos demais)
    IF NOT public._offer_open_to(NEW.ride_request_id, NEW.applicant_id) THEN
        RAISE EXCEPTION 'Esta entrega está, por alguns minutos, só para os motoristas favoritos da loja' USING ERRCODE = '42501', HINT = 'exclusive_window';
    END IF;
    -- O frete de entrega de loja é fixo: quem aceita, aceita o valor oferecido (nada de preço próprio por aqui)
    SELECT order_id, offered_price INTO v_order, v_offered FROM public.ride_offers WHERE id = NEW.ride_request_id;
    IF v_order IS NOT NULL AND NEW.proposed_price IS DISTINCT FROM v_offered THEN
        RAISE EXCEPTION 'O frete desta entrega é fixo (R$ %): aceite o valor oferecido', v_offered USING ERRCODE = '42501';
    END IF;
    -- Capacidade: entrega de loja só cabe se o motorista ainda tem espaço na mochila (serializa as candidaturas do mesmo motorista)
    IF v_order IS NOT NULL THEN
        -- Pendências com lojas (repasse de dinheiro, maquininha, contestações): barram novas entregas até regularizar
        v_block := public._dues_block_for_me(NEW.applicant_id);
        IF v_block IS NOT NULL THEN
            RAISE EXCEPTION '%', public._dues_block_message(v_block) USING ERRCODE = '42501', HINT = v_block;
        END IF;
        PERFORM pg_advisory_xact_lock(hashtext('delivery_capacity:' || NEW.applicant_id::text));
        SELECT count(*) INTO v_active FROM public.ride_requests WHERE driver_id = NEW.applicant_id AND order_id IS NOT NULL AND status = 'accepted';
        SELECT COALESCE(max(delivery_capacity), 1) INTO v_cap FROM public.driver_vehicles WHERE driver_id = NEW.applicant_id;
        IF v_active >= v_cap THEN
            RAISE EXCEPTION 'Sua mochila está cheia: você já está com % entrega(s) e a sua capacidade é %', v_active, v_cap USING ERRCODE = '42501', HINT = 'delivery_capacity_full';
        END IF;
        -- ... e em VOLUME: soma das unidades das entregas que já leva + esta ≤ o que ele diz que cabe (se informou)
        SELECT max(delivery_capacity_units) INTO v_cap_units FROM public.driver_vehicles WHERE driver_id = NEW.applicant_id;
        IF v_cap_units IS NOT NULL THEN
            SELECT COALESCE(sum(delivery_units), 0) INTO v_units FROM public.ride_requests WHERE driver_id = NEW.applicant_id AND order_id IS NOT NULL AND status = 'accepted';
            SELECT COALESCE(delivery_units, 1) INTO v_new_units FROM public.ride_offers WHERE id = NEW.ride_request_id;
            IF v_units + v_new_units > v_cap_units THEN
                RAISE EXCEPTION 'Não cabe na sua mochila: você já leva % unidade(s), esta tem % e você informou caber %', v_units, v_new_units, v_cap_units USING ERRCODE = '42501', HINT = 'delivery_capacity_units_full';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- ===== gatilhos que abrem as pendências =====
-- a maquininha: quando o entregador RETIRA um pedido de cartão, ela sai com ele
CREATE OR REPLACE FUNCTION public.trg_dues_machine_out() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders; v_id uuid; v_name text; v_owner uuid;
BEGIN
    IF NEW.order_id IS NULL OR NEW.driver_id IS NULL OR NEW.store_id IS NULL OR NOT (OLD.ride_started_at IS NULL AND NEW.ride_started_at IS NOT NULL) THEN RETURN NEW; END IF;
    SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
    IF o.payment_method NOT IN ('cartao', 'credit_card') THEN RETURN NEW; END IF;
    INSERT INTO public.store_dues (kind, store_id, driver_id, order_id, ride_id) VALUES ('machine', NEW.store_id, NEW.driver_id, NEW.order_id, NEW.id)
    ON CONFLICT (store_id, driver_id) WHERE kind = 'machine' AND status IN ('open', 'declared', 'disputed') DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
        SELECT split_part(COALESCE(name, 'O entregador'), ' ', 1) INTO v_name FROM public.profiles WHERE id = NEW.driver_id;
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
        PERFORM public._notify(v_owner, 'dues_update', NEW.driver_id, v_id,
            jsonb_build_object('title', 'Maquininha com o entregador', 'text', v_name || ' saiu com a maquininha para um pedido no cartão', 'path', public._store_slug_path(NEW.store_id)),
            'mach-out:' || v_id);
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_requests_zz_dues_machine_out ON public.ride_requests;
CREATE TRIGGER ride_requests_zz_dues_machine_out AFTER UPDATE OF ride_started_at ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION public.trg_dues_machine_out();

-- acabou a última entrega de cartão do entregador com essa loja: começa a contar o prazo para devolver a maquininha
CREATE OR REPLACE FUNCTION public._machine_recompute(p_store uuid, p_driver uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg public.delivery_dues_settings; d public.store_dues; v_name text;
BEGIN
    SELECT * INTO d FROM public.store_dues WHERE kind = 'machine' AND store_id = p_store AND driver_id = p_driver AND status = 'open' AND due_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    IF EXISTS (SELECT 1 FROM public.ride_requests r JOIN public.orders o ON o.id = r.order_id
                WHERE r.store_id = p_store AND r.driver_id = p_driver AND r.status = 'accepted' AND r.ride_started_at IS NOT NULL AND o.payment_method IN ('cartao', 'credit_card')) THEN RETURN; END IF;
    SELECT * INTO cfg FROM public.delivery_dues_settings WHERE id;
    UPDATE public.store_dues SET due_at = now() + make_interval(hours => cfg.machine_due_hours), updated_at = now() WHERE id = d.id;
    SELECT name INTO v_name FROM public.stores WHERE id = p_store;
    PERFORM public._notify(p_driver, 'dues_update', NULL, d.id,
        jsonb_build_object('title', 'Devolva a maquininha', 'text', 'Suas entregas no cartão acabaram. Devolva a maquininha à ' || COALESCE(v_name, 'loja') || ' em até ' || cfg.machine_due_hours || ' h.', 'path', '/entregas'),
        'mach-ret:' || d.id);
END; $$;
REVOKE ALL ON FUNCTION public._machine_recompute(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- entrega concluída: dinheiro vira repasse à loja; cartão/cancelamento pode fechar a conta da maquininha
CREATE OR REPLACE FUNCTION public.trg_dues_on_ride_end() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders; cfg public.delivery_dues_settings; v_amount numeric; v_id uuid; v_store text;
BEGIN
    IF NEW.order_id IS NULL OR NEW.driver_id IS NULL OR OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status NOT IN ('completed', 'cancelled') THEN RETURN NEW; END IF;
    IF NEW.status = 'completed' THEN
        SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
        IF o.payment_method IN ('dinheiro', 'money') THEN
            -- o entregador recebeu o TOTAL, fica com o frete e repassa o resto (o valor dos produtos) à loja
            v_amount := COALESCE(o.total_amount, 0) - COALESCE(NEW.offered_price, 0);
            IF v_amount > 0 THEN
                SELECT * INTO cfg FROM public.delivery_dues_settings WHERE id;
                INSERT INTO public.store_dues (kind, store_id, driver_id, order_id, ride_id, amount, collected, due_at)
                VALUES ('cash', NEW.store_id, NEW.driver_id, NEW.order_id, NEW.id, v_amount, o.total_amount, now() + make_interval(hours => cfg.cash_due_hours))
                ON CONFLICT (ride_id) WHERE kind = 'cash' DO NOTHING RETURNING id INTO v_id;
                IF v_id IS NOT NULL THEN
                    SELECT name INTO v_store FROM public.stores WHERE id = NEW.store_id;
                    PERFORM public._notify(NEW.driver_id, 'dues_update', NULL, v_id,
                        jsonb_build_object('title', 'Repasse à loja', 'text', 'Você recebeu ' || public._brl(o.total_amount) || ' em dinheiro: repasse ' || public._brl(v_amount) || ' à ' || COALESCE(v_store, 'loja') || ' (o frete é seu).', 'path', '/entregas'),
                        'cash:' || v_id);
                END IF;
            END IF;
        END IF;
    END IF;
    IF NEW.store_id IS NOT NULL THEN PERFORM public._machine_recompute(NEW.store_id, NEW.driver_id); END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS ride_requests_zz_dues_on_end ON public.ride_requests;
CREATE TRIGGER ride_requests_zz_dues_on_end AFTER UPDATE OF status ON public.ride_requests FOR EACH ROW EXECUTE FUNCTION public.trg_dues_on_ride_end();

-- ===== caixa: o ENTREGADOR =====
CREATE OR REPLACE FUNCTION public.get_my_dues() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); cfg public.delivery_dues_settings; v_items jsonb; v_block text; v_open numeric;
BEGIN
    IF uid IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO cfg FROM public.delivery_dues_settings WHERE id;
    SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at), '[]'::jsonb) INTO v_items FROM (
        SELECT d.id, d.kind, d.store_id, s.name AS store_name, d.amount, d.status, d.due_at, d.declared_at, d.declare_method, d.note, d.created_at,
               (d.status = 'open' AND d.due_at < now()) AS overdue
          FROM public.store_dues d JOIN public.stores s ON s.id = d.store_id
         WHERE d.driver_id = uid AND d.status IN ('open', 'declared', 'disputed')) x;
    SELECT COALESCE(sum(amount), 0) INTO v_open FROM public.store_dues WHERE driver_id = uid AND kind IN ('cash', 'dispute_debt') AND status = 'open';
    v_block := public._driver_dues_block(uid);
    RETURN jsonb_build_object('blocked', v_block, 'blocked_text', CASE WHEN v_block IS NULL THEN NULL ELSE public._dues_block_message(v_block) END,
                              'open_amount', v_open, 'max_open', cfg.cash_max_open, 'items', v_items);
END; $$;

-- onde repassar: a chave Pix da loja (só quem DEVE àquela loja a vê)
CREATE OR REPLACE FUNCTION public.get_due_remit_target(p_due uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.store_dues; s record;
BEGIN
    SELECT * INTO d FROM public.store_dues WHERE id = p_due AND driver_id = auth.uid() AND kind IN ('cash', 'dispute_debt') AND status IN ('open', 'disputed');
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT name, pix_key INTO s FROM public.stores WHERE id = d.store_id;
    RETURN jsonb_build_object('store_name', s.name, 'pix_key', s.pix_key, 'amount', d.amount);
END; $$;

CREATE OR REPLACE FUNCTION public.declare_due(p_due uuid, p_method text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); d public.store_dues; v_owner uuid; v_name text; v_txt text;
BEGIN
    SELECT * INTO d FROM public.store_dues WHERE id = p_due AND driver_id = uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF d.status NOT IN ('open', 'disputed') THEN RETURN; END IF;
    IF (d.kind = 'machine' AND p_method <> 'devolvida') OR (d.kind <> 'machine' AND p_method NOT IN ('pix', 'em_maos')) THEN RAISE EXCEPTION 'Forma inválida' USING ERRCODE = '22023'; END IF;
    UPDATE public.store_dues SET status = 'declared', declare_method = p_method, declared_at = now(), updated_at = now() WHERE id = p_due;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = d.store_id;
    SELECT split_part(COALESCE(name, 'O entregador'), ' ', 1) INTO v_name FROM public.profiles WHERE id = uid;
    v_txt := CASE WHEN d.kind = 'machine' THEN v_name || ' diz que devolveu a maquininha. Confira e confirme.'
                  ELSE v_name || ' diz que repassou ' || public._brl(d.amount) || ' ' || CASE p_method WHEN 'pix' THEN 'por Pix' ELSE 'em mãos' END || '. Confirme se recebeu.' END;
    PERFORM public._notify(v_owner, 'dues_update', uid, p_due, jsonb_build_object('title', CASE WHEN d.kind = 'machine' THEN 'Maquininha devolvida?' ELSE 'Repasse a confirmar' END, 'text', v_txt, 'path', public._store_slug_path(d.store_id)), 'decl:' || p_due || ':' || floor(extract(epoch FROM now()))::text);
END; $$;

-- ===== caixa: a LOJA =====
CREATE OR REPLACE FUNCTION public.get_store_dues(p_store uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_items jsonb; v_pending numeric;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at), '[]'::jsonb) INTO v_items FROM (
        SELECT d.id, d.kind, d.driver_id, p.name AS driver_name, p."profileSlug" AS driver_slug, d.amount, d.status, d.due_at, d.declared_at, d.declare_method, d.note, d.created_at,
               (d.status = 'open' AND d.due_at < now()) AS overdue
          FROM public.store_dues d JOIN public.profiles p ON p.id = d.driver_id
         WHERE d.store_id = p_store AND d.status IN ('open', 'declared', 'disputed')) x;
    SELECT COALESCE(sum(amount), 0) INTO v_pending FROM public.store_dues WHERE store_id = p_store AND kind IN ('cash', 'dispute_debt') AND status IN ('open', 'declared', 'disputed');
    RETURN jsonb_build_object('items', v_items, 'pending_amount', v_pending);
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_due(p_due uuid, p_ok boolean, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); d public.store_dues; v_store_name text;
BEGIN
    SELECT d2.* INTO d FROM public.store_dues d2 JOIN public.stores s ON s.id = d2.store_id WHERE d2.id = p_due AND s.owner_id = uid FOR UPDATE OF d2;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF d.status NOT IN ('open', 'declared') THEN RETURN; END IF;
    SELECT name INTO v_store_name FROM public.stores WHERE id = d.store_id;
    IF p_ok THEN
        UPDATE public.store_dues SET status = 'confirmed', confirmed_at = now(), updated_at = now() WHERE id = p_due;
        PERFORM public._notify(d.driver_id, 'dues_update', uid, p_due, jsonb_build_object('title', 'Confirmado pela loja', 'text', COALESCE(v_store_name, 'A loja') || ' confirmou ' || CASE WHEN d.kind = 'machine' THEN 'a devolução da maquininha.' ELSE 'o repasse de ' || public._brl(d.amount) || '.' END, 'path', '/entregas'), 'conf:' || p_due);
    ELSE
        IF btrim(COALESCE(p_note, '')) = '' THEN RAISE EXCEPTION 'Diga o que aconteceu' USING ERRCODE = '22023'; END IF;
        UPDATE public.store_dues SET status = 'disputed', note = left(btrim(p_note), 500), updated_at = now() WHERE id = p_due;
        PERFORM public._notify(d.driver_id, 'dues_update', uid, p_due, jsonb_build_object('title', 'Loja contestou', 'text', COALESCE(v_store_name, 'A loja') || ' diz que não recebeu ' || CASE WHEN d.kind = 'machine' THEN 'a maquininha.' ELSE 'o repasse de ' || public._brl(d.amount) || '.' END || ' Resolva no Caixa.', 'path', '/entregas'), 'disp:' || p_due || ':' || floor(extract(epoch FROM now()))::text);
    END IF;
END; $$;

-- o ADMIN resolve um repasse contestado (só o servidor)
CREATE OR REPLACE FUNCTION public.admin_decide_due(p_due uuid, p_decision text, p_note text, p_admin uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.store_dues;
BEGIN
    IF p_decision NOT IN ('confirmed', 'waived') THEN RAISE EXCEPTION 'Decisão inválida' USING ERRCODE = '22023'; END IF;
    SELECT * INTO d FROM public.store_dues WHERE id = p_due FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pendência não encontrada'; END IF;
    UPDATE public.store_dues SET status = p_decision, confirmed_at = CASE WHEN p_decision = 'confirmed' THEN now() END, note = COALESCE(left(p_note, 500), note), decided_by = p_admin, decided_at = now(), updated_at = now() WHERE id = p_due;
    PERFORM public._notify(d.driver_id, 'dues_update', NULL, p_due, jsonb_build_object('title', 'Pendência resolvida', 'text', 'O iUser resolveu a pendência com a loja.', 'path', '/entregas'), 'adm:' || p_due);
    PERFORM public._notify((SELECT owner_id FROM public.stores WHERE id = d.store_id), 'dues_update', NULL, p_due, jsonb_build_object('title', 'Pendência resolvida', 'text', 'O iUser resolveu a pendência com o entregador.', 'path', public._store_slug_path(d.store_id)), 'adms:' || p_due);
END; $$;

-- ===== contestação =====
CREATE OR REPLACE FUNCTION public.open_delivery_dispute(p_order uuid, p_reason text, p_note text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); cfg public.delivery_dues_settings; o public.orders; r public.ride_requests; pr public.delivery_proofs; v_id uuid; v_owner uuid; v_slug text; v_drv text;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Entre para contestar' USING ERRCODE = '42501'; END IF;
    IF p_reason NOT IN ('not_received', 'incomplete', 'other') THEN RAISE EXCEPTION 'Motivo inválido' USING ERRCODE = '22023'; END IF;
    SELECT * INTO cfg FROM public.delivery_dues_settings WHERE id;
    SELECT * INTO o FROM public.orders WHERE id = p_order AND buyer_id = uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO r FROM public.ride_requests WHERE order_id = p_order AND status = 'completed' ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Só dá para contestar uma entrega já concluída' USING ERRCODE = '22023'; END IF;
    SELECT * INTO pr FROM public.delivery_proofs WHERE ride_id = r.id;
    IF pr.done_at IS NULL THEN RAISE EXCEPTION 'Esta entrega é antiga: fale com o suporte' USING ERRCODE = '22023'; END IF;
    IF pr.done_at < now() - make_interval(hours => cfg.dispute_window_hours) THEN RAISE EXCEPTION 'O prazo para contestar (% h) já passou', cfg.dispute_window_hours USING ERRCODE = '22023', HINT = 'dispute_window'; END IF;
    IF EXISTS (SELECT 1 FROM public.delivery_disputes WHERE order_id = p_order) THEN RAISE EXCEPTION 'Este pedido já foi contestado' USING ERRCODE = '22023', HINT = 'dispute_exists'; END IF;
    IF (SELECT count(*) FROM public.delivery_disputes WHERE customer_id = uid AND outcome = 'rejected' AND decided_at > now() - make_interval(days => cfg.abuse_days)) >= cfg.abuse_limit THEN
        RAISE EXCEPTION 'Suas contestações recentes foram recusadas: fale com o suporte' USING ERRCODE = '42501', HINT = 'dispute_abuse';
    END IF;
    SELECT split_part(COALESCE(name, ''), ' ', 1) INTO v_drv FROM public.profiles WHERE id = r.driver_id;
    INSERT INTO public.delivery_disputes (order_id, ride_id, store_id, driver_id, customer_id, reason, note, evidence)
    VALUES (p_order, r.id, o.store_id, r.driver_id, uid, p_reason, NULLIF(left(btrim(COALESCE(p_note, '')), 400), ''), jsonb_build_object(
        'proof_method', pr.method, 'proof_reason', pr.reason, 'proof_photo', pr.photo_path, 'proof_at', pr.proof_at,
        'arrived_at', r.arrived_destination_at, 'done_at', pr.done_at, 'done_dist_m', pr.done_dist_m,
        'minutes_at_door', CASE WHEN r.arrived_destination_at IS NULL THEN NULL ELSE round(extract(epoch FROM pr.done_at - r.arrived_destination_at) / 60)::int END,
        'driver_name', v_drv, 'payment_method', o.payment_method, 'order_total', o.total_amount, 'delivery_fee', o.delivery_fee, 'address', o.delivery_address))
    RETURNING id INTO v_id;
    SELECT owner_id, "storeSlug" INTO v_owner, v_slug FROM public.stores WHERE id = o.store_id;
    PERFORM public._notify(v_owner, 'dispute_update', uid, v_id, jsonb_build_object('title', 'Entrega contestada', 'text', 'Um cliente diz que não recebeu um pedido entregue. Veja e responda.', 'path', '/painel-loja/' || v_slug), 'dsp-s:' || v_id);
    IF r.driver_id IS NOT NULL THEN
        PERFORM public._notify(r.driver_id, 'dispute_update', uid, v_id, jsonb_build_object('title', 'Entrega contestada', 'text', 'O cliente contestou uma entrega sua. Responda no Caixa.', 'path', '/entregas'), 'dsp-d:' || v_id);
    END IF;
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.reply_delivery_dispute(p_dispute uuid, p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); d public.delivery_disputes; v_owner uuid; v_txt text := left(btrim(COALESCE(p_note, '')), 400);
BEGIN
    IF v_txt = '' THEN RAISE EXCEPTION 'Escreva a sua resposta' USING ERRCODE = '22023'; END IF;
    SELECT * INTO d FROM public.delivery_disputes WHERE id = p_dispute FOR UPDATE;
    IF NOT FOUND OR d.status <> 'open' THEN RAISE EXCEPTION 'Contestação não encontrada ou já decidida' USING ERRCODE = '22023'; END IF;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = d.store_id;
    IF uid = v_owner THEN UPDATE public.delivery_disputes SET store_reply = v_txt WHERE id = p_dispute;
    ELSIF uid = d.driver_id THEN UPDATE public.delivery_disputes SET driver_reply = v_txt WHERE id = p_dispute;
    ELSE RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
END; $$;

-- a contestação do pedido, como cada parte enxerga (nunca o código de entrega)
CREATE OR REPLACE FUNCTION public.get_delivery_dispute_view(p_order uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); d public.delivery_disputes; v_owner uuid; v_role text; cfg public.delivery_dues_settings; pr public.delivery_proofs; v_can boolean := false;
BEGIN
    SELECT * INTO cfg FROM public.delivery_dues_settings WHERE id;
    SELECT * INTO d FROM public.delivery_disputes WHERE order_id = p_order;
    IF NOT FOUND THEN
        -- ainda não contestada: o cliente (e só ele) vê se ainda dá tempo
        SELECT dp.* INTO pr FROM public.delivery_proofs dp JOIN public.orders o ON o.id = dp.order_id WHERE dp.order_id = p_order AND o.buyer_id = uid AND dp.done_at IS NOT NULL ORDER BY dp.created_at DESC LIMIT 1;
        IF FOUND AND pr.done_at > now() - make_interval(hours => cfg.dispute_window_hours) THEN v_can := true; END IF;
        RETURN jsonb_build_object('exists', false, 'can_open', v_can, 'window_hours', cfg.dispute_window_hours);
    END IF;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = d.store_id;
    v_role := CASE WHEN uid = d.customer_id THEN 'customer' WHEN uid = v_owner THEN 'store' WHEN uid = d.driver_id THEN 'driver' END;
    IF v_role IS NULL THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('exists', true, 'role', v_role, 'id', d.id, 'reason', d.reason, 'note', d.note, 'status', d.status, 'evidence', d.evidence,
        'store_reply', d.store_reply, 'driver_reply', d.driver_reply, 'outcome', d.outcome, 'decision_note', d.decision_note, 'decided_at', d.decided_at,
        'refund_amount', d.refund_amount, 'refund_status', d.refund_status, 'refund_method', d.refund_method, 'refund_contested', d.refund_contested, 'created_at', d.created_at);
END; $$;

-- as contestações abertas/recentes da LOJA e do ENTREGADOR (para listar nas telas deles)
CREATE OR REPLACE FUNCTION public.get_my_delivery_disputes(p_store uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC), '[]'::jsonb) INTO v FROM (
        SELECT d.id, d.order_id, d.reason, d.note, d.status, d.outcome, d.decision_note, d.store_reply, d.driver_reply, d.refund_amount, d.refund_status, d.refund_contested, d.created_at, d.evidence,
               s.name AS store_name, s.id AS store_id, CASE WHEN uid = s.owner_id THEN 'store' ELSE 'driver' END AS role
          FROM public.delivery_disputes d JOIN public.stores s ON s.id = d.store_id
         WHERE ((uid = s.owner_id AND (p_store IS NULL OR s.id = p_store)) OR (uid = d.driver_id AND p_store IS NULL))
           AND (d.status = 'open' OR d.refund_status IN ('pending', 'declared') OR d.decided_at > now() - interval '7 days')
         ORDER BY d.created_at DESC LIMIT 30) x;
    RETURN v;
END; $$;

-- reembolso: a loja devolve ao cliente (por fora do iUser) e declara; o cliente confirma
CREATE OR REPLACE FUNCTION public.declare_dispute_refund(p_dispute uuid, p_method text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); d public.delivery_disputes;
BEGIN
    IF p_method NOT IN ('pix', 'dinheiro', 'cartao', 'outro') THEN RAISE EXCEPTION 'Forma inválida' USING ERRCODE = '22023'; END IF;
    SELECT d2.* INTO d FROM public.delivery_disputes d2 JOIN public.stores s ON s.id = d2.store_id WHERE d2.id = p_dispute AND s.owner_id = uid FOR UPDATE OF d2;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF d.refund_status <> 'pending' THEN RETURN; END IF;
    UPDATE public.delivery_disputes SET refund_status = 'declared', refund_method = p_method, refund_contested = false WHERE id = p_dispute;
    PERFORM public._notify(d.customer_id, 'dispute_update', uid, p_dispute, jsonb_build_object('title', 'Reembolso enviado', 'text', 'A loja diz que reembolsou ' || public._brl(d.refund_amount) || '. Confirme se recebeu.', 'path', '/carrinho?aba=pedidos'), 'rf-d:' || p_dispute || ':' || floor(extract(epoch FROM now()))::text);
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_dispute_refund(p_dispute uuid, p_ok boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); d public.delivery_disputes; v_owner uuid;
BEGIN
    SELECT * INTO d FROM public.delivery_disputes WHERE id = p_dispute AND customer_id = uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    IF d.refund_status <> 'declared' THEN RETURN; END IF;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = d.store_id;
    IF p_ok THEN
        UPDATE public.delivery_disputes SET refund_status = 'confirmed' WHERE id = p_dispute;
    ELSE
        UPDATE public.delivery_disputes SET refund_status = 'pending', refund_contested = true WHERE id = p_dispute;
        PERFORM public._notify(v_owner, 'dispute_update', uid, p_dispute, jsonb_build_object('title', 'Cliente diz que não recebeu o reembolso', 'text', 'O cliente não confirmou o reembolso de ' || public._brl(d.refund_amount) || '. Confira e declare de novo.', 'path', public._store_slug_path(d.store_id)), 'rf-n:' || p_dispute || ':' || floor(extract(epoch FROM now()))::text);
    END IF;
END; $$;

-- o ADMIN decide a contestação (só o servidor)
CREATE OR REPLACE FUNCTION public.admin_decide_dispute(p_dispute uuid, p_outcome text, p_note text, p_admin uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.delivery_disputes; o public.orders; cfg public.delivery_dues_settings; v_owner uuid; v_slug text; v_debt numeric; v_title text; v_ctext text; v_stext text; v_dtext text;
BEGIN
    IF p_outcome NOT IN ('rejected', 'driver_at_fault', 'store_at_fault', 'redelivery') THEN RAISE EXCEPTION 'Decisão inválida' USING ERRCODE = '22023'; END IF;
    SELECT * INTO d FROM public.delivery_disputes WHERE id = p_dispute FOR UPDATE;
    IF NOT FOUND OR d.status <> 'open' THEN RAISE EXCEPTION 'Contestação não encontrada ou já decidida' USING ERRCODE = '22023'; END IF;
    SELECT * INTO o FROM public.orders WHERE id = d.order_id;
    SELECT * INTO cfg FROM public.delivery_dues_settings WHERE id;
    SELECT owner_id, "storeSlug" INTO v_owner, v_slug FROM public.stores WHERE id = d.store_id;
    UPDATE public.delivery_disputes SET status = 'decided', outcome = p_outcome, decision_note = NULLIF(left(btrim(COALESCE(p_note, '')), 500), ''), decided_by = p_admin, decided_at = now(),
           refund_amount = CASE WHEN p_outcome IN ('driver_at_fault', 'store_at_fault') THEN o.total_amount END,
           refund_status = CASE WHEN p_outcome IN ('driver_at_fault', 'store_at_fault') THEN 'pending' ELSE 'none' END
     WHERE id = p_dispute;
    IF p_outcome = 'driver_at_fault' AND d.driver_id IS NOT NULL THEN
        -- o entregador deve à loja o valor dos produtos (a loja reembolsa o cliente por inteiro)
        v_debt := COALESCE(o.total_amount, 0) - COALESCE(o.delivery_fee, 0);
        IF v_debt > 0 THEN
            INSERT INTO public.store_dues (kind, store_id, driver_id, order_id, ride_id, amount, due_at, note)
            VALUES ('dispute_debt', d.store_id, d.driver_id, d.order_id, d.ride_id, v_debt, now() + make_interval(hours => cfg.debt_due_hours), 'Contestação decidida contra o entregador')
            ON CONFLICT (order_id) WHERE kind = 'dispute_debt' DO NOTHING;
        END IF;
    END IF;
    v_title := 'Contestação decidida';
    v_ctext := CASE p_outcome WHEN 'rejected' THEN 'O iUser analisou e a entrega foi considerada recebida (a prova vale).'
        WHEN 'redelivery' THEN 'O iUser decidiu que a loja deve reenviar o seu pedido.'
        ELSE 'O iUser decidiu a seu favor: a loja deve reembolsar ' || public._brl(o.total_amount) || '.' END;
    v_stext := CASE p_outcome WHEN 'rejected' THEN 'A contestação foi recusada: a entrega vale.'
        WHEN 'redelivery' THEN 'Reenvie o pedido ao cliente (por sua conta).'
        WHEN 'driver_at_fault' THEN 'Culpa do entregador. Reembolse o cliente (' || public._brl(o.total_amount) || ') e declare; o entregador ficou devendo os produtos a você.'
        ELSE 'Culpa da loja. Reembolse o cliente (' || public._brl(o.total_amount) || ') e declare.' END;
    v_dtext := CASE p_outcome WHEN 'driver_at_fault' THEN 'Decidido contra você: você deve o valor dos produtos à loja. Veja no Caixa.' WHEN 'rejected' THEN 'A contestação foi recusada: a entrega vale.' ELSE 'A contestação não teve culpa sua.' END;
    PERFORM public._notify(d.customer_id, 'dispute_update', NULL, p_dispute, jsonb_build_object('title', v_title, 'text', v_ctext, 'path', '/carrinho?aba=pedidos'), 'dec-c:' || p_dispute);
    PERFORM public._notify(v_owner, 'dispute_update', NULL, p_dispute, jsonb_build_object('title', v_title, 'text', v_stext, 'path', '/painel-loja/' || v_slug), 'dec-s:' || p_dispute);
    IF d.driver_id IS NOT NULL THEN PERFORM public._notify(d.driver_id, 'dispute_update', NULL, p_dispute, jsonb_build_object('title', v_title, 'text', v_dtext, 'path', '/entregas'), 'dec-d:' || p_dispute); END IF;
END; $$;

-- permissões
DO $$ DECLARE f text; BEGIN
    FOREACH f IN ARRAY ARRAY['get_my_dues()', 'get_due_remit_target(uuid)', 'declare_due(uuid,text)', 'get_store_dues(uuid)', 'confirm_due(uuid,boolean,text)',
                             'open_delivery_dispute(uuid,text,text)', 'reply_delivery_dispute(uuid,text)', 'get_delivery_dispute_view(uuid)', 'get_my_delivery_disputes(uuid)',
                             'declare_dispute_refund(uuid,text)', 'confirm_dispute_refund(uuid,boolean)']
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
    END LOOP;
    FOREACH f IN ARRAY ARRAY['admin_decide_due(uuid,text,text,uuid)', 'admin_decide_dispute(uuid,text,text,uuid)']
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
    END LOOP;
END $$;
