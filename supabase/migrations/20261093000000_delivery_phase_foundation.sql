-- Etapa 2.1 / A — FUNDAÇÃO DA MÁQUINA DE ESTADOS DA ENTREGA (aditiva, ainda NÃO ativada para os usuários).
--
-- O que é: o vocabulário de fases do novo fluxo (18 fases), a tabela de transições permitidas e as colunas, em
-- order_delivery_dispatches, para estimativa / oferta / frete definitivo e para a futura reserva do motorista.
--
-- O que NÃO faz: não muda o fluxo atual. Toda entrega existente (e toda criada hoje) é flow_version = 1 ("legado"): a
-- coluna `phase` é apenas um ESPELHO, mantido por gatilho, do que `status` + `stage` já dizem. Nada no app ou nas funções
-- atuais lê `phase`; o aceite do motorista continua atribuindo a corrida na hora (não vira reserva). Só entregas
-- flow_version = 2 (que nada cria ainda) obedecerão à tabela de transições.
--
-- orders.status NÃO é tocado (pending/preparing/ready/paid/rejected).

-- ============================================================
-- 1. Fases (referência) e transições permitidas (para o futuro fluxo v2)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.delivery_phases (
    code        text PRIMARY KEY,
    label       text NOT NULL,
    description text NOT NULL,
    terminal    boolean NOT NULL DEFAULT false,
    sort_order  integer NOT NULL UNIQUE
);

INSERT INTO public.delivery_phases (code, label, description, terminal, sort_order) VALUES
    ('PROCURANDO_ENTREGADOR',               'Procurando entregador',                  'A loja aceitou; a oferta está aberta para os motoristas do raio.', false, 10),
    ('AGUARDANDO_AUTORIZACAO_REAJUSTE',     'Aguardando autorização do reajuste',     'Passou do limite de aumento automático: o cliente decide se continua procurando por mais.', false, 20),
    ('ENTREGADOR_RESERVADO',                'Entregador reservado',                   'Um motorista aceitou; o frete foi congelado e a corrida fica reservada por tempo limitado.', false, 30),
    ('AGUARDANDO_PAGAMENTO_CLIENTE',        'Aguardando pagamento do cliente',        'O cliente vê produtos + frete definitivo e paga diretamente à loja.', false, 40),
    ('LOJA_INFORMOU_RECEBIMENTO',           'Loja informou recebimento',              'A loja declarou ter recebido o pagamento do cliente (declaração, não confirmação bancária).', false, 50),
    ('AGUARDANDO_PAGAMENTO_ENTREGADOR',     'Aguardando pagamento do entregador',     'A loja deve pagar o frete integral ao motorista, direto por Pix.', false, 60),
    ('LOJA_INFORMOU_PAGAMENTO_ENTREGADOR',  'Loja informou pagamento ao entregador',  'A loja declarou ter pago o motorista; aguarda a confirmação dele.', false, 70),
    ('PAGAMENTO_EM_VERIFICACAO',            'Pagamento em verificação',               'O motorista disse não ter recebido: divergência em análise.', false, 80),
    ('ENTREGADOR_CONFIRMOU_RECEBIMENTO',    'Entregador confirmou recebimento',       'O motorista confirmou que recebeu o frete.', false, 90),
    ('ENTREGA_LIBERADA',                    'Entrega liberada',                       'O motorista pode ir até a loja.', false, 100),
    ('A_CAMINHO_DA_LOJA',                   'A caminho da loja',                      'O motorista saiu para a retirada.', false, 110),
    ('CHEGOU_NA_LOJA',                      'Chegou na loja',                         'O motorista chegou ao ponto de retirada.', false, 120),
    ('PEDIDO_RETIRADO',                     'Pedido retirado',                        'O motorista retirou o pedido.', false, 130),
    ('A_CAMINHO_DO_CLIENTE',                'A caminho do cliente',                   'O motorista está levando o pedido ao cliente.', false, 140),
    ('ENTREGUE',                            'Entregue',                               'O pedido chegou ao cliente.', false, 150),
    ('CONCLUIDO',                           'Concluído',                              'Entrega encerrada e pedido finalizado.', true, 160),
    ('CANCELADO',                           'Cancelado',                              'Entrega cancelada.', true, 170),
    ('SEM_ENTREGADOR',                      'Sem entregador',                         'A busca terminou sem nenhum motorista.', true, 180)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.delivery_phase_transitions (
    from_phase  text NOT NULL REFERENCES public.delivery_phases(code),
    to_phase    text NOT NULL REFERENCES public.delivery_phases(code),
    actor_role  text NOT NULL CHECK (actor_role IN ('system', 'customer', 'store', 'driver', 'admin')),
    PRIMARY KEY (from_phase, to_phase, actor_role)
);

INSERT INTO public.delivery_phase_transitions (from_phase, to_phase, actor_role) VALUES
    ('PROCURANDO_ENTREGADOR', 'AGUARDANDO_AUTORIZACAO_REAJUSTE', 'system'),
    ('PROCURANDO_ENTREGADOR', 'ENTREGADOR_RESERVADO', 'driver'),
    ('PROCURANDO_ENTREGADOR', 'ENTREGADOR_RESERVADO', 'system'),
    ('PROCURANDO_ENTREGADOR', 'SEM_ENTREGADOR', 'system'),
    ('PROCURANDO_ENTREGADOR', 'CANCELADO', 'customer'),
    ('PROCURANDO_ENTREGADOR', 'CANCELADO', 'store'),
    ('PROCURANDO_ENTREGADOR', 'CANCELADO', 'admin'),
    ('PROCURANDO_ENTREGADOR', 'CANCELADO', 'system'),
    ('AGUARDANDO_AUTORIZACAO_REAJUSTE', 'PROCURANDO_ENTREGADOR', 'customer'),
    ('AGUARDANDO_AUTORIZACAO_REAJUSTE', 'PROCURANDO_ENTREGADOR', 'system'),
    ('AGUARDANDO_AUTORIZACAO_REAJUSTE', 'ENTREGADOR_RESERVADO', 'driver'),
    ('AGUARDANDO_AUTORIZACAO_REAJUSTE', 'SEM_ENTREGADOR', 'system'),
    ('AGUARDANDO_AUTORIZACAO_REAJUSTE', 'CANCELADO', 'customer'),
    ('AGUARDANDO_AUTORIZACAO_REAJUSTE', 'CANCELADO', 'store'),
    ('AGUARDANDO_AUTORIZACAO_REAJUSTE', 'CANCELADO', 'admin'),
    ('AGUARDANDO_AUTORIZACAO_REAJUSTE', 'CANCELADO', 'system'),
    ('ENTREGADOR_RESERVADO', 'AGUARDANDO_PAGAMENTO_CLIENTE', 'system'),
    ('ENTREGADOR_RESERVADO', 'PROCURANDO_ENTREGADOR', 'system'),
    ('ENTREGADOR_RESERVADO', 'CANCELADO', 'customer'),
    ('ENTREGADOR_RESERVADO', 'CANCELADO', 'store'),
    ('ENTREGADOR_RESERVADO', 'CANCELADO', 'admin'),
    ('AGUARDANDO_PAGAMENTO_CLIENTE', 'LOJA_INFORMOU_RECEBIMENTO', 'store'),
    ('AGUARDANDO_PAGAMENTO_CLIENTE', 'PROCURANDO_ENTREGADOR', 'system'),
    ('AGUARDANDO_PAGAMENTO_CLIENTE', 'CANCELADO', 'customer'),
    ('AGUARDANDO_PAGAMENTO_CLIENTE', 'CANCELADO', 'store'),
    ('AGUARDANDO_PAGAMENTO_CLIENTE', 'CANCELADO', 'admin'),
    ('AGUARDANDO_PAGAMENTO_CLIENTE', 'CANCELADO', 'system'),
    ('LOJA_INFORMOU_RECEBIMENTO', 'AGUARDANDO_PAGAMENTO_ENTREGADOR', 'system'),
    ('LOJA_INFORMOU_RECEBIMENTO', 'CANCELADO', 'store'),
    ('LOJA_INFORMOU_RECEBIMENTO', 'CANCELADO', 'admin'),
    ('AGUARDANDO_PAGAMENTO_ENTREGADOR', 'LOJA_INFORMOU_PAGAMENTO_ENTREGADOR', 'store'),
    ('AGUARDANDO_PAGAMENTO_ENTREGADOR', 'CANCELADO', 'store'),
    ('AGUARDANDO_PAGAMENTO_ENTREGADOR', 'CANCELADO', 'driver'),
    ('AGUARDANDO_PAGAMENTO_ENTREGADOR', 'CANCELADO', 'admin'),
    ('LOJA_INFORMOU_PAGAMENTO_ENTREGADOR', 'ENTREGADOR_CONFIRMOU_RECEBIMENTO', 'driver'),
    ('LOJA_INFORMOU_PAGAMENTO_ENTREGADOR', 'PAGAMENTO_EM_VERIFICACAO', 'driver'),
    ('LOJA_INFORMOU_PAGAMENTO_ENTREGADOR', 'CANCELADO', 'admin'),
    ('PAGAMENTO_EM_VERIFICACAO', 'ENTREGADOR_CONFIRMOU_RECEBIMENTO', 'driver'),
    ('PAGAMENTO_EM_VERIFICACAO', 'ENTREGADOR_CONFIRMOU_RECEBIMENTO', 'admin'),
    ('PAGAMENTO_EM_VERIFICACAO', 'AGUARDANDO_PAGAMENTO_ENTREGADOR', 'admin'),
    ('PAGAMENTO_EM_VERIFICACAO', 'CANCELADO', 'admin'),
    ('ENTREGADOR_CONFIRMOU_RECEBIMENTO', 'ENTREGA_LIBERADA', 'system'),
    ('ENTREGA_LIBERADA', 'A_CAMINHO_DA_LOJA', 'driver'),
    ('ENTREGA_LIBERADA', 'CANCELADO', 'driver'),
    ('ENTREGA_LIBERADA', 'CANCELADO', 'store'),
    ('ENTREGA_LIBERADA', 'CANCELADO', 'admin'),
    ('A_CAMINHO_DA_LOJA', 'CHEGOU_NA_LOJA', 'driver'),
    ('A_CAMINHO_DA_LOJA', 'CANCELADO', 'driver'),
    ('A_CAMINHO_DA_LOJA', 'CANCELADO', 'admin'),
    ('CHEGOU_NA_LOJA', 'PEDIDO_RETIRADO', 'driver'),
    ('CHEGOU_NA_LOJA', 'CANCELADO', 'driver'),
    ('CHEGOU_NA_LOJA', 'CANCELADO', 'admin'),
    ('PEDIDO_RETIRADO', 'A_CAMINHO_DO_CLIENTE', 'driver'),
    ('PEDIDO_RETIRADO', 'CANCELADO', 'admin'),
    ('A_CAMINHO_DO_CLIENTE', 'ENTREGUE', 'driver'),
    ('A_CAMINHO_DO_CLIENTE', 'CANCELADO', 'admin'),
    ('ENTREGUE', 'CONCLUIDO', 'system'),
    ('ENTREGUE', 'CONCLUIDO', 'customer'),
    ('ENTREGUE', 'CONCLUIDO', 'store')
ON CONFLICT DO NOTHING;

-- referência interna: sem acesso para o app (o servidor lê; o app não precisa)
ALTER TABLE public.delivery_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_phase_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_phases, public.delivery_phase_transitions FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 2. Espelho do fluxo ATUAL (legado) em fases: status + stage -> phase
--    stage 'assigned' = motorista aceitou e já pode ir (hoje não há reserva nem pagamento): ENTREGA_LIBERADA.
--    stage 'in_transit' = "Iniciar corrida" (retirada feita, a caminho do cliente): A_CAMINHO_DO_CLIENTE.
--    completed = corrida concluída E pedido já finalizado pelo fluxo atual: CONCLUIDO.
-- ============================================================
CREATE OR REPLACE FUNCTION public._legacy_delivery_phase(p_status text, p_stage text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_status = 'cancelled' OR p_stage = 'cancelled' THEN 'CANCELADO'
        WHEN p_status = 'completed' OR p_stage = 'delivered' THEN 'CONCLUIDO'
        WHEN p_status = 'accepted' AND p_stage = 'in_transit' THEN 'A_CAMINHO_DO_CLIENTE'
        WHEN p_status = 'accepted' AND p_stage = 'at_store' THEN 'CHEGOU_NA_LOJA'
        WHEN p_status = 'accepted' AND p_stage = 'to_store' THEN 'A_CAMINHO_DA_LOJA'
        WHEN p_status = 'accepted' THEN 'ENTREGA_LIBERADA'
        ELSE 'PROCURANDO_ENTREGADOR'
    END
$$;

-- ============================================================
-- 3. Colunas novas em order_delivery_dispatches (todas aditivas/anuláveis, exceto flow_version/phase)
--
--    ESTIMATIVA   estimated_freight   frete estimado antes da busca (legado: = original_freight, que já era o frete do checkout)
--    OFERTA ATUAL final_freight       (já existia) frete autorizado vigente; o que o motorista vê é ride_requests.offered_price
--                                     (= driver_offer da rodada vigente) e o histórico fica em order_delivery_rounds
--    FRETE DEFINITIVO frozen_freight + freight_frozen_at   valor congelado no aceite
-- ============================================================
ALTER TABLE public.order_delivery_dispatches
    ADD COLUMN IF NOT EXISTS flow_version smallint NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS phase text,
    ADD COLUMN IF NOT EXISTS phase_changed_at timestamptz,
    ADD COLUMN IF NOT EXISTS estimated_freight numeric,
    ADD COLUMN IF NOT EXISTS frozen_freight numeric,
    ADD COLUMN IF NOT EXISTS freight_frozen_at timestamptz,
    ADD COLUMN IF NOT EXISTS reserved_at timestamptz,
    ADD COLUMN IF NOT EXISTS reserved_until timestamptz,
    ADD COLUMN IF NOT EXISTS reservation_released_at timestamptz,
    ADD COLUMN IF NOT EXISTS reservation_release_reason text;

ALTER TABLE public.order_delivery_dispatches
    ADD CONSTRAINT odd_flow_version_check CHECK (flow_version IN (1, 2)),
    ADD CONSTRAINT odd_estimated_freight_check CHECK (estimated_freight IS NULL OR estimated_freight >= 0),
    ADD CONSTRAINT odd_frozen_freight_check CHECK (frozen_freight IS NULL OR frozen_freight >= 0),
    ADD CONSTRAINT odd_frozen_pair_check CHECK ((frozen_freight IS NULL) = (freight_frozen_at IS NULL)),
    ADD CONSTRAINT odd_reservation_window_check CHECK (reserved_until IS NULL OR (reserved_at IS NOT NULL AND reserved_until > reserved_at)),
    ADD CONSTRAINT odd_reservation_release_reason_check CHECK (reservation_release_reason IS NULL OR reservation_release_reason IN
        ('customer_timeout', 'driver_cancelled', 'store_cancelled', 'customer_cancelled', 'payment_not_confirmed', 'admin', 'other')),
    ADD CONSTRAINT odd_reservation_release_pair_check CHECK ((reservation_release_reason IS NULL) = (reservation_released_at IS NULL)),
    ADD CONSTRAINT odd_phase_fkey FOREIGN KEY (phase) REFERENCES public.delivery_phases(code);

-- Backfill: toda entrega existente é do fluxo atual (flow_version 1) e ganha o espelho da fase, a estimativa
-- (= frete do checkout, original_freight) e, se já aceita/concluída, o frete congelado no aceite (= final_freight).
UPDATE public.order_delivery_dispatches
   SET phase = public._legacy_delivery_phase(status, stage),
       phase_changed_at = COALESCE(updated_at, created_at),
       estimated_freight = original_freight,
       frozen_freight = CASE WHEN status IN ('accepted', 'completed') THEN final_freight END,
       freight_frozen_at = CASE WHEN status IN ('accepted', 'completed') THEN COALESCE(updated_at, created_at) END;

ALTER TABLE public.order_delivery_dispatches ALTER COLUMN phase SET NOT NULL;

CREATE INDEX IF NOT EXISTS order_delivery_dispatches_phase_idx ON public.order_delivery_dispatches (phase);
CREATE INDEX IF NOT EXISTS order_delivery_dispatches_reserved_idx ON public.order_delivery_dispatches (reserved_until) WHERE reserved_until IS NOT NULL AND reservation_released_at IS NULL;

-- ============================================================
-- 4. Gatilho: v1 espelha; v2 só aceita transições da tabela
-- ============================================================
CREATE OR REPLACE FUNCTION public.dispatch_phase_maintain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_actor text;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.flow_version <> NEW.flow_version THEN
        RAISE EXCEPTION 'A versão do fluxo da entrega não muda depois de criada' USING ERRCODE = '42501';
    END IF;
    IF NEW.flow_version = 1 THEN
        -- fluxo atual: a fase é só um espelho de status/stage; ninguém decide por ela
        NEW.phase := public._legacy_delivery_phase(NEW.status, NEW.stage);
        IF TG_OP = 'INSERT' THEN
            NEW.estimated_freight := COALESCE(NEW.estimated_freight, NEW.original_freight);
        END IF;
        IF NEW.status IN ('accepted', 'completed') AND NEW.frozen_freight IS NULL THEN
            NEW.frozen_freight := NEW.final_freight;
            NEW.freight_frozen_at := now();
        END IF;
        IF TG_OP = 'INSERT' OR NEW.phase IS DISTINCT FROM OLD.phase THEN
            NEW.phase_changed_at := now();
        END IF;
    ELSE
        -- fluxo novo (ainda não criado por nada): fase obrigatória e só transições previstas para quem age
        IF NEW.phase IS NULL THEN RAISE EXCEPTION 'Entrega do novo fluxo exige a fase inicial'; END IF;
        IF TG_OP = 'UPDATE' AND NEW.phase IS DISTINCT FROM OLD.phase THEN
            v_actor := COALESCE(NULLIF(current_setting('app.delivery_actor', true), ''), 'system');
            IF NOT EXISTS (
                SELECT 1 FROM public.delivery_phase_transitions
                 WHERE from_phase = OLD.phase AND to_phase = NEW.phase AND actor_role = v_actor
            ) THEN
                RAISE EXCEPTION 'Transição de fase não permitida: % -> % (%)', OLD.phase, NEW.phase, v_actor USING ERRCODE = '42501';
            END IF;
            NEW.phase_changed_at := now();
        ELSIF TG_OP = 'INSERT' THEN
            NEW.phase_changed_at := now();
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_delivery_dispatches_phase ON public.order_delivery_dispatches;
CREATE TRIGGER order_delivery_dispatches_phase
    BEFORE INSERT OR UPDATE ON public.order_delivery_dispatches
    FOR EACH ROW EXECUTE FUNCTION public.dispatch_phase_maintain();
