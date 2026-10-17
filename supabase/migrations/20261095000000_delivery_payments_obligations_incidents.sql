-- Etapa 2.1 / C — ESTRUTURAS DO FUTURO FLUXO FINANCEIRO/OPERACIONAL (vazias e inativas nesta etapa).
--
--  delivery_payment_events : DECLARAÇÕES sobre pagamentos entre cliente, loja e motorista. NÃO é confirmação bancária.
--                            O iUser não recebe, não custodia e não movimenta esse dinheiro.
--  delivery_obligations    : o que um motorista passa a DEVER À LOJA (ex.: recebeu o frete e cancelou por culpa própria).
--                            É um conceito SEPARADO de driver_postpaid_charges (que é a dívida do motorista/loja COM O iUSER).
--  delivery_incidents      : ocorrências e disputas de uma entrega, com análise administrativa.
--
-- Segurança: RLS ligado; visitante sem acesso; usuário logado só LÊ o que é da própria entrega (loja dona, motorista da
-- entrega, quem abriu); ninguém do app escreve (sem INSERT/UPDATE/DELETE): as próximas etapas criam as funções do servidor.
-- delivery_payment_events é append-only (nem o servidor edita ou apaga linha: correção = nova linha).

-- ============================================================
-- 1. Declarações de pagamento
-- ============================================================
CREATE TABLE IF NOT EXISTS public.delivery_payment_events (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id   uuid NOT NULL REFERENCES public.order_delivery_dispatches(id) ON DELETE RESTRICT,
    order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    store_id      uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    ride_request_id uuid REFERENCES public.ride_requests(id) ON DELETE RESTRICT,
    driver_id     uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
    kind          text NOT NULL CHECK (kind IN (
        'store_declared_customer_payment',      -- LOJA_INFORMOU_RECEBIMENTO_CLIENTE
        'store_declared_driver_payment',        -- LOJA_INFORMOU_PAGAMENTO_ENTREGADOR
        'driver_confirmed_receipt',             -- ENTREGADOR_CONFIRMOU_RECEBIMENTO
        'driver_declared_not_received',         -- ENTREGADOR_INFORMOU_NAO_RECEBIMENTO
        'sent_for_verification',                -- PAGAMENTO_ENVIADO_PARA_VERIFICACAO
        'admin_resolution'                      -- RESOLUCAO_ADMINISTRATIVA
    )),
    amount        numeric(12,2) CHECK (amount IS NULL OR amount >= 0),
    declared_by   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    declared_role text NOT NULL CHECK (declared_role IN ('store', 'driver', 'customer', 'admin', 'system')),
    note          text CHECK (note IS NULL OR char_length(note) <= 500),
    metadata      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(metadata) <= 4096),
    created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.delivery_payment_events IS 'Declarações de pagamento (NÃO são confirmação bancária). Append-only. O iUser não recebe nem repassa esse dinheiro.';
CREATE INDEX IF NOT EXISTS delivery_payment_events_dispatch_idx ON public.delivery_payment_events (dispatch_id, created_at);
CREATE INDEX IF NOT EXISTS delivery_payment_events_store_idx ON public.delivery_payment_events (store_id);
CREATE INDEX IF NOT EXISTS delivery_payment_events_driver_idx ON public.delivery_payment_events (driver_id);

CREATE OR REPLACE FUNCTION public.delivery_payment_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'delivery_payment_events é append-only: registre uma nova declaração em vez de alterar ou apagar' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS delivery_payment_events_no_update ON public.delivery_payment_events;
CREATE TRIGGER delivery_payment_events_no_update BEFORE UPDATE OR DELETE ON public.delivery_payment_events
    FOR EACH ROW EXECUTE FUNCTION public.delivery_payment_events_append_only();

-- ============================================================
-- 2. Obrigações motorista -> loja (separadas do livro de R$ 0,50 do iUser)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.delivery_obligations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id     uuid NOT NULL REFERENCES public.order_delivery_dispatches(id) ON DELETE RESTRICT,
    order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    ride_request_id uuid REFERENCES public.ride_requests(id) ON DELETE RESTRICT,
    store_id        uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    driver_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,   -- quem deve
    amount          numeric(12,2) NOT NULL CHECK (amount > 0),
    reason          text NOT NULL CHECK (reason IN ('cancelled_after_receipt', 'not_delivered', 'other')),
    status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'disputed', 'settled', 'waived')),
    created_by      uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,           -- NULL = sistema
    created_at      timestamptz NOT NULL DEFAULT now(),
    settled_at      timestamptz,                                                       -- regularização
    settlement_note text CHECK (settlement_note IS NULL OR char_length(settlement_note) <= 500),
    decided_by      uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,           -- administrador responsável
    decided_at      timestamptz,
    decision_note   text CHECK (decision_note IS NULL OR char_length(decision_note) <= 1000),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_obligations_settled_check CHECK ((status = 'settled') = (settled_at IS NOT NULL)),
    CONSTRAINT delivery_obligations_decision_check CHECK ((decided_by IS NULL) = (decided_at IS NULL)),
    CONSTRAINT delivery_obligations_waived_check CHECK (status <> 'waived' OR decided_by IS NOT NULL)
);
COMMENT ON TABLE public.delivery_obligations IS 'O que o motorista deve À LOJA. Separado de driver_postpaid_charges (dívida COM O iUSER). Sem bloqueio automático nesta etapa.';
-- uma obrigação em aberto por entrega e motivo
CREATE UNIQUE INDEX IF NOT EXISTS delivery_obligations_open_idx ON public.delivery_obligations (dispatch_id, reason)
    WHERE status IN ('open', 'under_review', 'disputed');
CREATE INDEX IF NOT EXISTS delivery_obligations_driver_idx ON public.delivery_obligations (driver_id, status);
CREATE INDEX IF NOT EXISTS delivery_obligations_store_idx ON public.delivery_obligations (store_id, status);

-- ============================================================
-- 3. Ocorrências e disputas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.delivery_incidents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id     uuid NOT NULL REFERENCES public.order_delivery_dispatches(id) ON DELETE RESTRICT,
    order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    ride_request_id uuid REFERENCES public.ride_requests(id) ON DELETE RESTRICT,
    store_id        uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    driver_id       uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
    kind            text NOT NULL CHECK (kind IN (
        'store_says_paid', 'driver_not_received', 'cancelled_after_receipt', 'divergence',
        'operational', 'cancellation_contested', 'other')),
    description     text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
    opened_by       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    opened_role     text NOT NULL CHECK (opened_role IN ('store', 'driver', 'customer', 'admin', 'system')),
    status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
    resolution      text CHECK (resolution IS NULL OR char_length(resolution) <= 2000),
    resolved_by     uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,           -- administrador responsável
    resolved_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_incidents_resolved_pair_check CHECK ((status IN ('resolved', 'dismissed')) = (resolved_at IS NOT NULL)),
    CONSTRAINT delivery_incidents_resolver_check CHECK (resolved_at IS NULL OR resolved_by IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS delivery_incidents_dispatch_idx ON public.delivery_incidents (dispatch_id);
CREATE INDEX IF NOT EXISTS delivery_incidents_open_idx ON public.delivery_incidents (status, created_at) WHERE status IN ('open', 'under_review');

-- updated_at automático
CREATE OR REPLACE FUNCTION public.delivery_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS delivery_obligations_touch ON public.delivery_obligations;
CREATE TRIGGER delivery_obligations_touch BEFORE UPDATE ON public.delivery_obligations FOR EACH ROW EXECUTE FUNCTION public.delivery_touch_updated_at();
DROP TRIGGER IF EXISTS delivery_incidents_touch ON public.delivery_incidents;
CREATE TRIGGER delivery_incidents_touch BEFORE UPDATE ON public.delivery_incidents FOR EACH ROW EXECUTE FUNCTION public.delivery_touch_updated_at();

-- ============================================================
-- 4. RLS e privilégios (menor privilégio)
-- ============================================================
ALTER TABLE public.delivery_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_incidents ENABLE ROW LEVEL SECURITY;

-- Quem vê: a loja dona da entrega e o motorista envolvido (o cliente não vê declarações de pagamento loja<->motorista)
DROP POLICY IF EXISTS dpe_select ON public.delivery_payment_events;
CREATE POLICY dpe_select ON public.delivery_payment_events FOR SELECT TO authenticated
    USING (driver_id = auth.uid() OR store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS dob_select ON public.delivery_obligations;
CREATE POLICY dob_select ON public.delivery_obligations FOR SELECT TO authenticated
    USING (driver_id = auth.uid() OR store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS din_select ON public.delivery_incidents;
CREATE POLICY din_select ON public.delivery_incidents FOR SELECT TO authenticated
    USING (opened_by = auth.uid() OR driver_id = auth.uid() OR store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

REVOKE ALL ON public.delivery_payment_events, public.delivery_obligations, public.delivery_incidents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.delivery_payment_events, public.delivery_obligations, public.delivery_incidents TO authenticated;
