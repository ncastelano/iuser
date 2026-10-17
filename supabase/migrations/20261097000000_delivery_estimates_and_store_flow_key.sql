-- Etapa 2.3 — ESTIMATIVA OFICIAL DO FRETE (calculada no servidor) + CHAVE DO FLUXO V2 POR LOJA.
--
-- Inativa para o fluxo atual: nada nesta migration muda como o fluxo V1 calcula frete, cria pedido ou entrega.
--
--  * delivery_estimates : cada estimativa calculada pelo servidor (valor, distância, versão do cálculo e um SNAPSHOT enxuto,
--    sem endereço nem dados pessoais). As coordenadas do destino ficam só em colunas privadas (a leitura é do próprio cliente),
--    fora do snapshot. Linhas não usadas por pedido são apagadas depois de 7 dias.
--  * order_delivery_dispatches.estimate_id : liga a entrega futura à estimativa que a originou. estimated_freight (e estimate_id)
--    passam a ser IMUTÁVEIS depois de gravados: a estimativa é histórica e não muda quando a oferta sobe.
--  * store_delivery_flow : chave do V2 POR LOJA (nasce FALSE e o banco impede TRUE por enquanto). Tabela só do servidor: o dono
--    da loja não lê nem altera. Uma entrega só pode nascer V2 se a chave GLOBAL (delivery_dispatch_settings.new_delivery_flow_enabled)
--    E a da loja estiverem ligadas (função store_uses_delivery_flow_v2 + gatilho de criação).
--  * Auditoria: o evento 'estimate_recorded' de order_delivery_events passa a levar estimate_id e o snapshot (sem segundo histórico).

-- ============================================================
-- 1. Estimativas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.delivery_estimates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id            uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    destination_lat     double precision NOT NULL,
    destination_lng     double precision NOT NULL,
    estimated_freight   numeric(10,2) NOT NULL CHECK (estimated_freight >= 0),
    distance_km         numeric(8,3) NOT NULL CHECK (distance_km >= 0),
    calculation_version text NOT NULL,
    snapshot            jsonb NOT NULL CHECK (pg_column_size(snapshot) <= 4096),
    expires_at          timestamptz NOT NULL,
    order_id            uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_estimates_customer_idx ON public.delivery_estimates (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS delivery_estimates_order_idx ON public.delivery_estimates (order_id) WHERE order_id IS NOT NULL;

-- Histórico: só o vínculo com o pedido pode ser preenchido (uma vez); valor, distância e snapshot não mudam nunca.
CREATE OR REPLACE FUNCTION public.delivery_estimates_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF (to_jsonb(NEW) - 'order_id') IS DISTINCT FROM (to_jsonb(OLD) - 'order_id')
       OR (OLD.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id) THEN
        RAISE EXCEPTION 'A estimativa é histórica e não pode ser alterada' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS delivery_estimates_no_edit ON public.delivery_estimates;
CREATE TRIGGER delivery_estimates_no_edit BEFORE UPDATE ON public.delivery_estimates
    FOR EACH ROW EXECUTE FUNCTION public.delivery_estimates_immutable();

ALTER TABLE public.delivery_estimates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_estimates_own_select ON public.delivery_estimates;
CREATE POLICY delivery_estimates_own_select ON public.delivery_estimates FOR SELECT TO authenticated USING (customer_id = auth.uid());
REVOKE ALL ON public.delivery_estimates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.delivery_estimates TO authenticated;           -- só as próprias; ninguém escreve pelo app

-- limpeza diária das estimativas que não viraram pedido
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'delivery-estimates-cleanup';
SELECT cron.schedule('delivery-estimates-cleanup', '17 3 * * *',
    $job$DELETE FROM public.delivery_estimates WHERE order_id IS NULL AND created_at < now() - interval '7 days'$job$);

-- ============================================================
-- 2. A entrega aponta para a estimativa; estimated_freight vira histórico imutável
-- ============================================================
ALTER TABLE public.order_delivery_dispatches
    ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES public.delivery_estimates(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.dispatch_estimate_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.estimated_freight IS NOT NULL AND NEW.estimated_freight IS DISTINCT FROM OLD.estimated_freight THEN
        RAISE EXCEPTION 'A estimativa inicial da entrega é histórica e não muda quando a oferta sobe' USING ERRCODE = '42501';
    END IF;
    IF OLD.estimate_id IS NOT NULL AND NEW.estimate_id IS DISTINCT FROM OLD.estimate_id THEN
        RAISE EXCEPTION 'A estimativa que originou a entrega não muda' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS order_delivery_dispatches_estimate_immutable ON public.order_delivery_dispatches;
CREATE TRIGGER order_delivery_dispatches_estimate_immutable BEFORE UPDATE ON public.order_delivery_dispatches
    FOR EACH ROW EXECUTE FUNCTION public.dispatch_estimate_immutable();

-- auditoria: o evento da estimativa leva o vínculo e o snapshot (reaproveita order_delivery_events)
CREATE OR REPLACE FUNCTION public.audit_dispatch_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_role text := NULLIF(current_setting('app.delivery_actor', true), '');
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'estimate_recorded', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('estimated_freight', NEW.estimated_freight, 'original_freight', NEW.original_freight,
                                   'radius_km', NEW.radius_km, 'flow_version', NEW.flow_version, 'estimate_id', NEW.estimate_id,
                                   'estimate_snapshot', (SELECT e.snapshot FROM public.delivery_estimates e WHERE e.id = NEW.estimate_id)), now());
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_from, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'phase_change', NULL, NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('status', NEW.status, 'stage', NEW.stage, 'flow_version', NEW.flow_version), now());
        RETURN NEW;
    END IF;

    IF NEW.phase IS DISTINCT FROM OLD.phase THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_from, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, CASE WHEN NEW.phase = 'CANCELADO' THEN 'cancelled' ELSE 'phase_change' END, OLD.phase, NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('status', NEW.status, 'stage', NEW.stage, 'flow_version', NEW.flow_version), now());
    END IF;
    IF NEW.frozen_freight IS NOT NULL AND OLD.frozen_freight IS NULL THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'freight_frozen', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('frozen_freight', NEW.frozen_freight, 'estimated_freight', NEW.estimated_freight, 'authorized_extra', NEW.authorized_extra), now());
    END IF;
    IF NEW.reserved_at IS NOT NULL AND OLD.reserved_at IS NULL THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'driver_reserved', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('reserved_until', NEW.reserved_until,
                                   'driver_id', (SELECT driver_id FROM public.ride_requests WHERE id = NEW.ride_request_id)), now());
    END IF;
    IF NEW.reservation_released_at IS NOT NULL AND OLD.reservation_released_at IS NULL THEN
        INSERT INTO public.order_delivery_events (dispatch_id, kind, phase_to, actor_id, actor_role, data, processed_at)
        VALUES (NEW.id, 'reservation_released', NEW.phase, v_actor, COALESCE(v_role, 'system'),
                jsonb_build_object('reason', NEW.reservation_release_reason), now());
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_dispatch_changes() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3. Chave do V2 por loja (+ global): ninguém entra no V2 por acidente
-- ============================================================
CREATE TABLE IF NOT EXISTS public.store_delivery_flow (
    store_id    uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    v2_enabled  boolean NOT NULL DEFAULT false,
    updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT store_delivery_flow_inactive_check CHECK (NOT v2_enabled)    -- relaxada só na etapa de ativação
);
COMMENT ON TABLE public.store_delivery_flow IS 'Chave do fluxo V2 por loja. Só o servidor/administrador geral controla; o dono da loja não vê nem altera.';
ALTER TABLE public.store_delivery_flow ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_delivery_flow FROM PUBLIC, anon, authenticated;

INSERT INTO public.store_delivery_flow (store_id) SELECT id FROM public.stores ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.store_delivery_flow_seed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.store_delivery_flow (store_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.store_delivery_flow_seed() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS stores_delivery_flow_seed ON public.stores;
CREATE TRIGGER stores_delivery_flow_seed AFTER INSERT ON public.stores FOR EACH ROW EXECUTE FUNCTION public.store_delivery_flow_seed();

-- V2 só com as DUAS chaves ligadas (global E loja)
CREATE OR REPLACE FUNCTION public.store_uses_delivery_flow_v2(p_store uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT COALESCE((SELECT new_delivery_flow_enabled FROM public.delivery_dispatch_settings WHERE id), false)
       AND COALESCE((SELECT v2_enabled FROM public.store_delivery_flow WHERE store_id = p_store), false)
$$;
REVOKE ALL ON FUNCTION public.store_uses_delivery_flow_v2(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_flow_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.flow_version = 2 AND NOT public.store_uses_delivery_flow_v2(NEW.store_id) THEN
        RAISE EXCEPTION 'Entrega do novo fluxo exige a chave global E a chave da loja ligadas' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS order_delivery_dispatches_flow_gate ON public.order_delivery_dispatches;
CREATE TRIGGER order_delivery_dispatches_flow_gate BEFORE INSERT ON public.order_delivery_dispatches
    FOR EACH ROW EXECUTE FUNCTION public.dispatch_flow_gate();

-- ============================================================
-- 4. FÓRMULA OFICIAL DA ESTIMATIVA (versão est-v1) — única, no banco, em centavos inteiros
--
--    bruto    = base_fee(moto) + extra_fee_objeto(moto) + round_half_up( max(0, dist_m - base_distance_m) * price_per_km_c / 1000 )
--    arredond.= NEAREST (meio sobe) ou UP, no múltiplo de freight_rounding_step
--    mínimo   = max(arredondado, min_freight)          -> nunca abaixo do mínimo configurado
--    teto     = min(resultado, max_freight)            -> nunca acima do teto (o teto vence)
--    final    = resultado em centavos / 100
--
--    Compatibilidade com o V1: a Tarifa iUser que o V1 grava nas colunas delivery_* da loja é a MESMA (moto + objeto),
--    por isso, para a mesma distância, o bruto é igual ao do V1. Diferenças documentadas: o V2 usa a distância de ROTA
--    (o V1, a linha reta) e aplica arredondamento/mínimo/teto (o V1 só faz round(…,2)). O V1 não é alterado.
-- ============================================================
CREATE OR REPLACE FUNCTION public._freight_round_cents(p_gross integer, p_step integer, p_mode text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_mode = 'UP' THEN (((p_gross + p_step - 1) / p_step) * p_step)
        ELSE (((2 * p_gross + p_step) / (2 * p_step)) * p_step)          -- NEAREST: meio sobe
    END
$$;
REVOKE ALL ON FUNCTION public._freight_round_cents(integer, integer, text) FROM PUBLIC, anon, authenticated;

-- Calcula o frete a partir de uma distância (metros) com a tarifa e as regras ATUAIS do banco. Devolve o detalhamento.
CREATE OR REPLACE FUNCTION public._compute_delivery_estimate(p_distance_m integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    t record;
    c record;
    v_base integer; v_extra integer; v_ppk integer; v_base_m integer;
    v_extra_m integer; v_per_km integer; v_gross integer;
    v_step integer; v_rounded integer; v_min integer; v_max integer; v_after_min integer; v_final integer;
BEGIN
    IF p_distance_m IS NULL OR p_distance_m < 0 THEN RAISE EXCEPTION 'Distância inválida'; END IF;
    SELECT base_fee, extra_fee_objeto, price_per_km, base_distance_km INTO t FROM public.platform_tariffs WHERE vehicle_kind = 'moto';
    IF NOT FOUND THEN RAISE EXCEPTION 'Tarifa da plataforma indisponível'; END IF;
    SELECT min_freight, max_freight, freight_rounding_step, freight_rounding_mode INTO c FROM public.delivery_dispatch_settings WHERE id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Configuração da entrega indisponível'; END IF;

    v_base   := round(t.base_fee * 100)::integer;
    v_extra  := round(t.extra_fee_objeto * 100)::integer;
    v_ppk    := round(t.price_per_km * 100)::integer;
    v_base_m := round(t.base_distance_km * 1000)::integer;
    v_extra_m := GREATEST(0, p_distance_m - v_base_m);
    v_per_km := round((v_extra_m::numeric * v_ppk) / 1000)::integer;
    v_gross  := v_base + v_extra + v_per_km;

    v_step := GREATEST(1, round(c.freight_rounding_step * 100)::integer);
    v_rounded := public._freight_round_cents(v_gross, v_step, c.freight_rounding_mode);
    v_min := round(c.min_freight * 100)::integer;
    v_max := round(c.max_freight * 100)::integer;
    v_after_min := GREATEST(v_rounded, v_min);
    v_final := LEAST(v_after_min, v_max);

    RETURN jsonb_build_object(
        'calculation_version', 'est-v1',
        'vehicle_kind', 'moto',
        'distance_m', p_distance_m,
        'base_cents', v_base,
        'extra_object_cents', v_extra,
        'price_per_km_cents', v_ppk,
        'base_distance_m', v_base_m,
        'extra_distance_m', v_extra_m,
        'per_km_cents', v_per_km,
        'gross_cents', v_gross,
        'rounding', jsonb_build_object('step_cents', v_step, 'mode', c.freight_rounding_mode, 'rounded_cents', v_rounded),
        'min_cents', v_min, 'min_applied', v_after_min > v_rounded,
        'max_cents', v_max, 'ceiling_applied', v_final < v_after_min,
        'final_cents', v_final
    );
END;
$$;
REVOKE ALL ON FUNCTION public._compute_delivery_estimate(integer) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 5. Registro da estimativa (SÓ o servidor chama; a distância vem da rota consultada pelo servidor, nunca do app)
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_delivery_estimate(
    p_customer uuid,
    p_store uuid,
    p_lat double precision,
    p_lng double precision,
    p_distance_m integer,
    p_distance_source text,        -- 'route' (Mapbox Directions) | 'straight_line' (fallback haversine)
    p_destination_check text       -- 'verified' (geocodificação confere) | 'unverified'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    s public.stores;
    v_straight_m integer;
    v_radius numeric;
    v_calc jsonb;
    v_snap jsonb;
    v_id uuid;
    v_exp timestamptz := now() + interval '30 minutes';
BEGIN
    IF p_distance_source NOT IN ('route', 'straight_line') OR p_destination_check NOT IN ('verified', 'unverified') THEN
        RAISE EXCEPTION 'Origem de distância inválida';
    END IF;
    IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -34 AND 6 OR p_lng NOT BETWEEN -74 AND -28 THEN
        RAISE EXCEPTION 'Destino fora do Brasil ou inválido' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO s FROM public.stores WHERE id = p_store;
    IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
    IF NOT (COALESCE(s.accepts_delivery, false) AND COALESCE(s.iuser_delivery_enabled, false)) THEN
        RAISE EXCEPTION 'Esta loja não usa a entrega iUser' USING ERRCODE = '22023';
    END IF;
    IF s.store_lat IS NULL OR s.store_lng IS NULL THEN RAISE EXCEPTION 'A loja não tem localização cadastrada'; END IF;

    v_straight_m := round(public.haversine_km(s.store_lat, s.store_lng, p_lat, p_lng) * 1000)::integer;
    SELECT max_radius_km INTO v_radius FROM public.delivery_dispatch_settings WHERE id;
    IF v_straight_m > v_radius * 1000 THEN
        RAISE EXCEPTION 'Endereço fora da área de entrega' USING ERRCODE = '22023';
    END IF;
    -- a rota nunca é bem mais curta que a linha reta: valor assim indica dado adulterado/defeituoso
    IF p_distance_source = 'route' AND p_distance_m < v_straight_m * 0.95 - 50 THEN
        RAISE EXCEPTION 'Distância de rota inconsistente' USING ERRCODE = '22023';
    END IF;
    IF p_distance_m > 400000 THEN RAISE EXCEPTION 'Distância inválida' USING ERRCODE = '22023'; END IF;
    IF (SELECT count(*) FROM public.delivery_estimates WHERE customer_id = p_customer AND created_at > now() - interval '1 hour') >= 60 THEN
        RAISE EXCEPTION 'Muitas estimativas em pouco tempo. Tente novamente mais tarde.' USING ERRCODE = '54000';
    END IF;

    v_calc := public._compute_delivery_estimate(p_distance_m);
    v_snap := v_calc || jsonb_build_object('distance_source', p_distance_source, 'destination_check', p_destination_check,
                                           'straight_line_m', v_straight_m, 'calculated_at', now());
    INSERT INTO public.delivery_estimates (customer_id, store_id, destination_lat, destination_lng, estimated_freight, distance_km,
                                           calculation_version, snapshot, expires_at)
    VALUES (p_customer, p_store, p_lat, p_lng, (v_calc->>'final_cents')::integer / 100.0, round(p_distance_m / 1000.0, 3),
            v_calc->>'calculation_version', v_snap, v_exp)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('estimate_id', v_id, 'estimated_freight', round((v_calc->>'final_cents')::integer / 100.0, 2),
                              'distance_km', round(p_distance_m / 1000.0, 3), 'calculation_version', v_calc->>'calculation_version',
                              'expires_at', v_exp);
END;
$$;
REVOKE ALL ON FUNCTION public.record_delivery_estimate(uuid, uuid, double precision, double precision, integer, text, text) FROM PUBLIC, anon, authenticated;

-- dados que a rota do servidor precisa da loja (coordenadas ficam no servidor; o app nunca as envia)
CREATE OR REPLACE FUNCTION public.get_estimate_store_origin(p_store uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT jsonb_build_object('lat', store_lat, 'lng', store_lng, 'max_radius_km', (SELECT max_radius_km FROM public.delivery_dispatch_settings WHERE id))
      FROM public.stores WHERE id = p_store AND COALESCE(accepts_delivery, false) AND COALESCE(iuser_delivery_enabled, false)
        AND store_lat IS NOT NULL AND store_lng IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.get_estimate_store_origin(uuid) FROM PUBLIC, anon, authenticated;
