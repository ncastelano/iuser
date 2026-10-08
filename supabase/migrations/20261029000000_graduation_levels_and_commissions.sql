-- ============================================================================
-- GRADUAÇÃO (níveis de comissão) — Inicial, Bronze, Prata, Ouro, Diamante... + comissões auditadas.
--
-- Não confundir com a "Hierarquia" que já existe (user_statuses: Usuário/Líder/Supervisor/Gestor/Administrador):
-- aquela é AUTORIDADE administrativa. Esta aqui é a GRADUAÇÃO que define quanto cada pessoa ganha por indicar.
--
-- Reaproveita: profiles.upline_id (indicação), wallet_transactions (crédito na carteira) e plans (preço do pré-pago).
-- Não mexe em profiles: o estado de graduação mora em user_network_state, que o cliente só LÊ (própria linha) —
-- profiles é legível por qualquer pessoa e aceita UPDATE na própria linha, o que não serve pra dado financeiro.
--
-- Regras centrais (todas no banco, uma fonte só):
--   * nível sobe sozinho pelas indicações diretas válidas e NUNCA desce;
--   * nível efetivo = o MAIOR entre o conquistado e o concedido pelo admin (concessão só eleva);
--   * comissão efetiva: personalizada ativa > padrão do nível efetivo > padrão do nível inicial;
--   * dinheiro em CENTAVOS e percentual em pontos-base (50% = 5000): sem ponto flutuante;
--   * a taxa usada fica CONGELADA em cada linha de commissions (histórico não é recalculado);
--   * teto padrão de 70%, configurável em network_settings.
-- ============================================================================

-- ===== Configuração global (uma linha só) =====
CREATE TABLE IF NOT EXISTS public.network_settings (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    max_commission_bp integer NOT NULL DEFAULT 7000 CHECK (max_commission_bp BETWEEN 0 AND 10000),
    -- Pós-pago não tem mensalidade: a "venda" é a quitação por Pix (hoje R$ 50). Valor só de referência pra exibição;
    -- a comissão sempre incide sobre o valor REALMENTE pago.
    postpaid_reference_cents integer NOT NULL DEFAULT 5000 CHECK (postpaid_reference_cents > 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid
);
INSERT INTO public.network_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- ===== Níveis (quantos o admin quiser; relação por ID, sem colunas level_1/level_2) =====
CREATE TABLE IF NOT EXISTS public.network_levels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
    level_order integer NOT NULL CHECK (level_order > 0),
    commission_prepaid_bp integer NOT NULL CHECK (commission_prepaid_bp BETWEEN 0 AND 10000),
    commission_postpaid_bp integer NOT NULL CHECK (commission_postpaid_bp BETWEEN 0 AND 10000),
    min_direct_referrals integer NOT NULL DEFAULT 0 CHECK (min_direct_referrals >= 0),
    -- Reservado pra critérios futuros (vendas pessoais, volume, equipe...). Hoje só min_direct_referrals vale;
    -- as funções de escrita rejeitam chaves aqui pra ninguém achar que um critério não implementado está valendo.
    requirements jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(requirements) = 'object'),
    is_active boolean NOT NULL DEFAULT true,
    border_style text NOT NULL DEFAULT 'solid' CHECK (border_style IN ('solid', 'double', 'dashed', 'gradient', 'glow', 'diamond')),
    border_color text NOT NULL DEFAULT '#94a3b8' CHECK (border_color ~ '^#[0-9a-fA-F]{6}$'),
    border_colors text[] NOT NULL DEFAULT '{}',
    background_style text NOT NULL DEFAULT 'none' CHECK (background_style IN ('none', 'soft', 'glass', 'gradient')),
    badge_style text NOT NULL DEFAULT 'pill' CHECK (badge_style IN ('pill', 'shield', 'ribbon', 'plain')),
    icon text CHECK (icon IS NULL OR char_length(icon) <= 30),
    description text CHECK (description IS NULL OR char_length(description) <= 300),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- Deferrable: dá pra trocar a ordem de dois níveis na mesma transação sem violar a unicidade no meio
    CONSTRAINT network_levels_order_key UNIQUE (level_order) DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX IF NOT EXISTS network_levels_name_key ON public.network_levels (lower(btrim(name)));

-- Nenhum percentual de nível passa do teto global
CREATE OR REPLACE FUNCTION public.trg_network_levels_cap()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_max integer;
BEGIN
    SELECT max_commission_bp INTO v_max FROM public.network_settings WHERE id;
    IF NEW.commission_prepaid_bp > v_max OR NEW.commission_postpaid_bp > v_max THEN
        RAISE EXCEPTION 'A comissão de um nível não pode passar de % %% (teto do sistema).', round(v_max / 100.0, 2);
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS network_levels_cap ON public.network_levels;
CREATE TRIGGER network_levels_cap BEFORE INSERT OR UPDATE ON public.network_levels
    FOR EACH ROW EXECUTE FUNCTION public.trg_network_levels_cap();

-- ===== Estado de graduação de cada pessoa (o cliente só lê a própria linha) =====
CREATE TABLE IF NOT EXISTS public.user_network_state (
    user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    highest_level_id uuid REFERENCES public.network_levels(id),   -- maior nível CONQUISTADO (nunca diminui); NULL = ainda o inicial
    manual_level_id uuid REFERENCES public.network_levels(id),    -- nível CONCEDIDO pelo admin (só eleva)
    level_achieved_at timestamptz,
    custom_commission_enabled boolean NOT NULL DEFAULT false,
    custom_commission_prepaid_bp integer CHECK (custom_commission_prepaid_bp IS NULL OR custom_commission_prepaid_bp BETWEEN 0 AND 10000),
    custom_commission_postpaid_bp integer CHECK (custom_commission_postpaid_bp IS NULL OR custom_commission_postpaid_bp BETWEEN 0 AND 10000),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===== Como cada pessoa chegou ao nível atual =====
CREATE TABLE IF NOT EXISTS public.user_level_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    previous_level_id uuid REFERENCES public.network_levels(id),
    new_level_id uuid REFERENCES public.network_levels(id),
    change_type text NOT NULL CHECK (change_type IN ('automatic_upgrade', 'manual_grant', 'admin_change')),
    reason text,
    changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_level_history_user_idx ON public.user_level_history (user_id, created_at DESC);

-- ===== Livro-caixa de comissões (a taxa fica congelada na linha) =====
CREATE TABLE IF NOT EXISTS public.commissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,          -- quem GANHOU
    source_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,           -- quem pagou
    transaction_id text NOT NULL,                                                    -- id do pagamento (Asaas)
    subscription_id uuid,
    plan_id uuid,
    plan_type text NOT NULL CHECK (plan_type IN ('prepaid', 'postpaid')),
    base_amount_cents bigint NOT NULL CHECK (base_amount_cents > 0),
    commission_rate_bp integer NOT NULL CHECK (commission_rate_bp BETWEEN 0 AND 10000),
    commission_amount_cents bigint NOT NULL CHECK (commission_amount_cents >= 0),
    level_id uuid REFERENCES public.network_levels(id),
    level_name_snapshot text,
    is_custom_commission boolean NOT NULL DEFAULT false,
    commission_source text NOT NULL CHECK (commission_source IN ('custom', 'manual_level', 'achieved_level', 'initial_level')),
    status text NOT NULL DEFAULT 'credited' CHECK (status IN ('pending', 'credited', 'paid', 'canceled')),
    wallet_transaction_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz,
    CONSTRAINT commissions_once_per_payment UNIQUE (transaction_id, user_id, plan_type)
);
CREATE INDEX IF NOT EXISTS commissions_user_idx ON public.commissions (user_id, created_at DESC);

-- ===== Auditoria administrativa (quem fez o quê, valor anterior e novo) =====
CREATE TABLE IF NOT EXISTS public.system_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id uuid,
    target_user_id uuid,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id uuid,
    old_value jsonb,
    new_value jsonb,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS system_logs_created_idx ON public.system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS system_logs_target_idx ON public.system_logs (target_user_id, created_at DESC);

-- ===== RLS: o cliente nunca escreve; só lê o que é dele (ou a escada pública de níveis) =====
ALTER TABLE public.network_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_network_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_level_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.network_settings, public.network_levels, public.user_network_state,
              public.user_level_history, public.commissions, public.system_logs FROM anon, authenticated;
GRANT SELECT ON public.network_levels, public.user_network_state, public.user_level_history, public.commissions TO authenticated;
GRANT SELECT ON public.network_levels TO anon;

DROP POLICY IF EXISTS "Escada de níveis é pública" ON public.network_levels;
CREATE POLICY "Escada de níveis é pública" ON public.network_levels FOR SELECT USING (is_active);
DROP POLICY IF EXISTS "Cada pessoa vê o próprio estado" ON public.user_network_state;
CREATE POLICY "Cada pessoa vê o próprio estado" ON public.user_network_state FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Cada pessoa vê o próprio histórico" ON public.user_level_history;
CREATE POLICY "Cada pessoa vê o próprio histórico" ON public.user_level_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Cada pessoa vê as próprias comissões" ON public.commissions;
CREATE POLICY "Cada pessoa vê as próprias comissões" ON public.commissions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- Funções internas
-- ============================================================================

CREATE OR REPLACE FUNCTION public._log(p_actor uuid, p_target uuid, p_action text, p_entity text, p_entity_id uuid,
                                       p_old jsonb, p_new jsonb, p_reason text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    INSERT INTO public.system_logs (actor_id, target_user_id, action, entity, entity_id, old_value, new_value, reason)
    VALUES (p_actor, p_target, p_action, p_entity, p_entity_id, p_old, p_new, NULLIF(btrim(COALESCE(p_reason, '')), ''));
$$;

-- Nível inicial = o ativo de menor ordem
CREATE OR REPLACE FUNCTION public._initial_level_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT id FROM public.network_levels WHERE is_active ORDER BY level_order LIMIT 1;
$$;

-- Indicações diretas VÁLIDAS: quem tem upline_id = a pessoa, ativo e não bloqueado (conta apagada some da tabela)
CREATE OR REPLACE FUNCTION public._count_valid_directs(p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT count(*)::integer FROM public.profiles
    WHERE upline_id = p_user AND COALESCE(is_active, true) AND NOT COALESCE(is_blocked, false);
$$;

-- Tamanho total da rede (todos os descendentes), com trava de profundidade
CREATE OR REPLACE FUNCTION public._count_network(p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH RECURSIVE down AS (
        SELECT id, 1 AS depth FROM public.profiles WHERE upline_id = p_user
        UNION ALL
        SELECT p.id, d.depth + 1 FROM public.profiles p JOIN down d ON p.upline_id = d.id WHERE d.depth < 30
    )
    SELECT count(*)::integer FROM down;
$$;

-- Os critérios de um nível. HOJE só min_direct_referrals; é aqui que entram vendas, volume, equipe... no futuro.
CREATE OR REPLACE FUNCTION public._level_requirements_met(p_user uuid, p_level public.network_levels)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT public._count_valid_directs(p_user) >= p_level.min_direct_referrals;
$$;

-- Nível efetivo: o MAIOR entre o conquistado e o concedido; sem nenhum dos dois, o inicial
CREATE OR REPLACE FUNCTION public._effective_level_id(p_user uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(
        (SELECT l.id
           FROM public.user_network_state s
           JOIN public.network_levels l ON l.id IN (s.highest_level_id, s.manual_level_id)
          WHERE s.user_id = p_user
          ORDER BY l.level_order DESC LIMIT 1),
        public._initial_level_id()
    );
$$;

-- ============================================================================
-- COMISSÃO EFETIVA — fonte única da verdade
-- p_plan_type: 'prepaid' | 'postpaid'
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_effective_commission(p_user uuid, p_plan_type text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_state public.user_network_state;
    v_level public.network_levels;
    v_level_id uuid;
    v_max integer;
    v_standard integer;
    v_custom integer;
    v_rate integer;
    v_source text;
    v_manual_order integer;
    v_high_order integer;
BEGIN
    IF p_plan_type NOT IN ('prepaid', 'postpaid') THEN
        RAISE EXCEPTION 'Tipo de plano inválido: % (use prepaid ou postpaid).', p_plan_type;
    END IF;

    SELECT * INTO v_state FROM public.user_network_state WHERE user_id = p_user;
    v_level_id := public._effective_level_id(p_user);
    SELECT * INTO v_level FROM public.network_levels WHERE id = v_level_id;
    IF v_level.id IS NULL THEN
        RAISE EXCEPTION 'Nenhum nível de graduação cadastrado.';
    END IF;
    SELECT max_commission_bp INTO v_max FROM public.network_settings WHERE id;

    v_standard := CASE p_plan_type WHEN 'prepaid' THEN v_level.commission_prepaid_bp ELSE v_level.commission_postpaid_bp END;
    v_custom := CASE WHEN COALESCE(v_state.custom_commission_enabled, false)
                     THEN CASE p_plan_type WHEN 'prepaid' THEN v_state.custom_commission_prepaid_bp ELSE v_state.custom_commission_postpaid_bp END
                END;

    SELECT level_order INTO v_manual_order FROM public.network_levels WHERE id = v_state.manual_level_id;
    SELECT level_order INTO v_high_order FROM public.network_levels WHERE id = v_state.highest_level_id;

    IF v_custom IS NOT NULL THEN
        v_rate := v_custom;
        v_source := 'custom';
    ELSE
        v_rate := v_standard;
        v_source := CASE
            WHEN v_manual_order IS NOT NULL AND v_manual_order > COALESCE(v_high_order, 0) THEN 'manual_level'
            WHEN v_state.highest_level_id IS NOT NULL THEN 'achieved_level'
            ELSE 'initial_level'
        END;
    END IF;

    RETURN jsonb_build_object(
        'level_id', v_level.id,
        'level', v_level.name,
        'level_order', v_level.level_order,
        'standard_rate_bp', v_standard,
        'commission_rate_bp', LEAST(v_rate, v_max),
        'commission_rate_percent', round(LEAST(v_rate, v_max) / 100.0, 2),
        'commission_source', v_source,
        'is_custom', v_custom IS NOT NULL
    );
END $$;

-- Comissão em centavos: arredonda meio pra cima, só com inteiros (R$ 100,00 × 50% = 5000 centavos exatos)
CREATE OR REPLACE FUNCTION public.commission_cents(p_base_cents bigint, p_rate_bp integer)
RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
    SELECT (p_base_cents * p_rate_bp + 5000) / 10000;
$$;

-- ============================================================================
-- PROGRESSÃO — sobe quantos níveis couberem, registra cada etapa, NUNCA desce
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_and_upgrade_user_level(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_state public.user_network_state;
    v_base_order integer;
    v_prev uuid;
    v_level public.network_levels;
    v_new uuid;
    v_directs integer;
BEGIN
    IF p_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN
        RETURN jsonb_build_object('upgraded', false);
    END IF;

    INSERT INTO public.user_network_state (user_id) VALUES (p_user) ON CONFLICT DO NOTHING;
    SELECT * INTO v_state FROM public.user_network_state WHERE user_id = p_user FOR UPDATE;

    v_directs := public._count_valid_directs(p_user);
    -- Ponto de partida: o conquistado (ou o inicial). Só olhamos níveis ACIMA dele.
    v_prev := COALESCE(v_state.highest_level_id, public._initial_level_id());
    SELECT level_order INTO v_base_order FROM public.network_levels WHERE id = v_prev;

    FOR v_level IN
        SELECT * FROM public.network_levels
         WHERE is_active AND level_order > COALESCE(v_base_order, 0)
         ORDER BY level_order
    LOOP
        EXIT WHEN NOT public._level_requirements_met(p_user, v_level);   -- os níveis atingidos formam um prefixo da escada
        INSERT INTO public.user_level_history (user_id, previous_level_id, new_level_id, change_type, reason)
        VALUES (p_user, v_prev, v_level.id, 'automatic_upgrade', format('Chegou a %s indicações diretas válidas', v_directs));
        v_prev := v_level.id;
        v_new := v_level.id;
    END LOOP;

    IF v_new IS NOT NULL THEN
        UPDATE public.user_network_state
           SET highest_level_id = v_new, level_achieved_at = now(), updated_at = now()
         WHERE user_id = p_user;
        PERFORM public._log(NULL, p_user, 'level_auto_upgrade', 'user_network_state', NULL,
                            to_jsonb(v_state.highest_level_id), to_jsonb(v_new), format('%s indicações diretas válidas', v_directs));
    END IF;

    RETURN jsonb_build_object('upgraded', v_new IS NOT NULL, 'level_id', v_new, 'directs', v_directs);
END $$;

-- Reavalia todo mundo que tem indicados (depois de mudar requisitos/níveis)
CREATE OR REPLACE FUNCTION public.recheck_all_levels()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_n integer := 0;
BEGIN
    FOR v_id IN SELECT DISTINCT upline_id FROM public.profiles WHERE upline_id IS NOT NULL LOOP
        IF (public.check_and_upgrade_user_level(v_id) ->> 'upgraded')::boolean THEN v_n := v_n + 1; END IF;
    END LOOP;
    RETURN v_n;
END $$;

-- Cada indicação nova (ou que volta a ser válida) reavalia quem indicou
CREATE OR REPLACE FUNCTION public.trg_profile_referral_level()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.upline_id IS NOT NULL THEN
        PERFORM public.check_and_upgrade_user_level(NEW.upline_id);
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_referral_level ON public.profiles;
CREATE TRIGGER profiles_referral_level
    AFTER INSERT OR UPDATE OF upline_id, is_active, is_blocked ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.trg_profile_referral_level();

-- ============================================================================
-- REGISTRO DA COMISSÃO — livro-caixa + carteira na MESMA transação (idempotente por pagamento)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_referral_commission(
    p_paying_user uuid, p_plan_type text, p_base_cents bigint, p_payment_id text,
    p_subscription_id uuid DEFAULT NULL, p_plan_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_upline uuid;
    v_eff jsonb;
    v_rate integer;
    v_amount bigint;
    v_commission_id uuid;
    v_wallet_id uuid;
    v_level_name text;
BEGIN
    IF p_base_cents IS NULL OR p_base_cents <= 0 THEN
        RETURN jsonb_build_object('credited', false, 'reason', 'valor inválido');
    END IF;

    SELECT upline_id INTO v_upline FROM public.profiles WHERE id = p_paying_user;
    IF v_upline IS NULL THEN
        RETURN jsonb_build_object('credited', false, 'reason', 'sem indicador');
    END IF;

    v_eff := public.get_effective_commission(v_upline, p_plan_type);
    v_rate := (v_eff ->> 'commission_rate_bp')::integer;
    v_amount := public.commission_cents(p_base_cents, v_rate);
    v_level_name := v_eff ->> 'level';

    INSERT INTO public.commissions (
        user_id, source_user_id, transaction_id, subscription_id, plan_id, plan_type,
        base_amount_cents, commission_rate_bp, commission_amount_cents, level_id, level_name_snapshot,
        is_custom_commission, commission_source, status
    ) VALUES (
        v_upline, p_paying_user, p_payment_id, p_subscription_id, p_plan_id, p_plan_type,
        p_base_cents, v_rate, v_amount, (v_eff ->> 'level_id')::uuid, v_level_name,
        (v_eff ->> 'is_custom')::boolean, v_eff ->> 'commission_source', 'credited'
    ) ON CONFLICT (transaction_id, user_id, plan_type) DO NOTHING
    RETURNING id INTO v_commission_id;

    IF v_commission_id IS NULL THEN
        RETURN jsonb_build_object('credited', false, 'reason', 'já registrada');   -- reentrega do mesmo evento
    END IF;

    IF v_amount > 0 THEN
        INSERT INTO public.wallet_transactions (user_id, type, amount, source_subscription_id, source_payment_id, description)
        VALUES (
            v_upline, 'commission_credit', v_amount / 100.0, p_subscription_id, p_payment_id,
            format('Comissão de indicação — %s%% (%s)', trim(trailing '.' FROM trim(trailing '0' FROM round(v_rate / 100.0, 2)::text)), v_level_name)
        ) RETURNING id INTO v_wallet_id;
        UPDATE public.commissions SET wallet_transaction_id = v_wallet_id WHERE id = v_commission_id;
    END IF;

    RETURN jsonb_build_object('credited', v_amount > 0, 'commission_id', v_commission_id, 'upline_id', v_upline,
                              'rate_bp', v_rate, 'amount_cents', v_amount, 'level', v_level_name,
                              'source', v_eff ->> 'commission_source');
END $$;

-- ============================================================================
-- Validação da escada de níveis (roda depois de cada escrita do admin)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._validate_levels()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_first public.network_levels;
    v_prev_min integer := -1;
    r public.network_levels;
BEGIN
    SELECT * INTO v_first FROM public.network_levels WHERE is_active ORDER BY level_order LIMIT 1;
    IF v_first.id IS NULL THEN
        RAISE EXCEPTION 'É preciso ter pelo menos um nível ativo.';
    END IF;
    IF v_first.min_direct_referrals <> 0 THEN
        RAISE EXCEPTION 'O primeiro nível (inicial) precisa exigir 0 indicados — todo mundo começa nele.';
    END IF;
    FOR r IN SELECT * FROM public.network_levels WHERE is_active ORDER BY level_order LOOP
        IF r.min_direct_referrals < v_prev_min THEN
            RAISE EXCEPTION 'O nível "%" exige menos indicados do que o nível anterior. A quantidade precisa crescer (ou ficar igual) a cada nível.', r.name;
        END IF;
        v_prev_min := r.min_direct_referrals;
    END LOOP;
END $$;

-- ============================================================================
-- ADMIN (só service role — as rotas /api/admin/graduation conferem o super admin antes de chamar)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_upsert_level(p_admin uuid, p_id uuid, p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_old public.network_levels;
    v_new public.network_levels;
    v_id uuid := p_id;
    v_colors text[];
    v_next_order integer;
BEGIN
    IF p_data ? 'requirements' AND p_data -> 'requirements' <> '{}'::jsonb THEN
        RAISE EXCEPTION 'Esse critério ainda não está disponível: hoje só a quantidade de indicados diretos vale.';
    END IF;
    IF p_data ? 'border_colors' THEN
        SELECT COALESCE(array_agg(c), '{}') INTO v_colors FROM jsonb_array_elements_text(p_data -> 'border_colors') c;
        IF EXISTS (SELECT 1 FROM unnest(v_colors) c WHERE c !~ '^#[0-9a-fA-F]{6}$') THEN
            RAISE EXCEPTION 'Cores da borda precisam estar no formato #RRGGBB.';
        END IF;
    END IF;

    IF p_id IS NULL THEN
        SELECT COALESCE(max(level_order), 0) + 1 INTO v_next_order FROM public.network_levels;
        INSERT INTO public.network_levels (name, level_order, commission_prepaid_bp, commission_postpaid_bp, min_direct_referrals,
                                           is_active, border_style, border_color, border_colors, background_style, badge_style, icon, description)
        VALUES (
            btrim(p_data ->> 'name'),
            COALESCE((p_data ->> 'level_order')::integer, v_next_order),
            (p_data ->> 'commission_prepaid_bp')::integer,
            COALESCE((p_data ->> 'commission_postpaid_bp')::integer, (p_data ->> 'commission_prepaid_bp')::integer),
            COALESCE((p_data ->> 'min_direct_referrals')::integer, 0),
            COALESCE((p_data ->> 'is_active')::boolean, true),
            COALESCE(p_data ->> 'border_style', 'solid'),
            COALESCE(p_data ->> 'border_color', '#94a3b8'),
            COALESCE(v_colors, '{}'),
            COALESCE(p_data ->> 'background_style', 'none'),
            COALESCE(p_data ->> 'badge_style', 'pill'),
            NULLIF(btrim(COALESCE(p_data ->> 'icon', '')), ''),
            NULLIF(btrim(COALESCE(p_data ->> 'description', '')), '')
        ) RETURNING id INTO v_id;
        SELECT * INTO v_new FROM public.network_levels WHERE id = v_id;
        PERFORM public._validate_levels();
        PERFORM public._log(p_admin, NULL, 'level_created', 'network_levels', v_id, NULL, to_jsonb(v_new), NULL);
    ELSE
        SELECT * INTO v_old FROM public.network_levels WHERE id = p_id FOR UPDATE;
        IF v_old.id IS NULL THEN RAISE EXCEPTION 'Nível não encontrado.'; END IF;
        UPDATE public.network_levels SET
            name = COALESCE(btrim(p_data ->> 'name'), name),
            commission_prepaid_bp = COALESCE((p_data ->> 'commission_prepaid_bp')::integer, commission_prepaid_bp),
            commission_postpaid_bp = COALESCE((p_data ->> 'commission_postpaid_bp')::integer, commission_postpaid_bp),
            min_direct_referrals = COALESCE((p_data ->> 'min_direct_referrals')::integer, min_direct_referrals),
            is_active = COALESCE((p_data ->> 'is_active')::boolean, is_active),
            border_style = COALESCE(p_data ->> 'border_style', border_style),
            border_color = COALESCE(p_data ->> 'border_color', border_color),
            border_colors = COALESCE(v_colors, border_colors),
            background_style = COALESCE(p_data ->> 'background_style', background_style),
            badge_style = COALESCE(p_data ->> 'badge_style', badge_style),
            icon = CASE WHEN p_data ? 'icon' THEN NULLIF(btrim(COALESCE(p_data ->> 'icon', '')), '') ELSE icon END,
            description = CASE WHEN p_data ? 'description' THEN NULLIF(btrim(COALESCE(p_data ->> 'description', '')), '') ELSE description END
        WHERE id = p_id;
        SELECT * INTO v_new FROM public.network_levels WHERE id = p_id;
        PERFORM public._validate_levels();
        PERFORM public._log(p_admin, NULL, 'level_updated', 'network_levels', p_id, to_jsonb(v_old), to_jsonb(v_new), NULL);
    END IF;

    PERFORM public.recheck_all_levels();   -- requisito mudou? quem já merece sobe (ninguém desce)
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_reorder_levels(p_admin uuid, p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old jsonb;
BEGIN
    IF (SELECT count(*) FROM public.network_levels) <> COALESCE(array_length(p_ids, 1), 0)
       OR EXISTS (SELECT 1 FROM unnest(p_ids) i WHERE NOT EXISTS (SELECT 1 FROM public.network_levels WHERE id = i)) THEN
        RAISE EXCEPTION 'A nova ordem precisa conter todos os níveis, uma vez cada.';
    END IF;
    SELECT jsonb_agg(id ORDER BY level_order) INTO v_old FROM public.network_levels;
    UPDATE public.network_levels l SET level_order = o.ord
      FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord) WHERE l.id = o.id;
    PERFORM public._validate_levels();
    PERFORM public._log(p_admin, NULL, 'levels_reordered', 'network_levels', NULL, v_old, to_jsonb(p_ids), NULL);
    PERFORM public.recheck_all_levels();
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_network_settings(p_admin uuid, p_max_bp integer, p_postpaid_reference_cents integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.network_settings; v_top integer;
BEGIN
    SELECT * INTO v_old FROM public.network_settings WHERE id FOR UPDATE;
    p_max_bp := COALESCE(p_max_bp, v_old.max_commission_bp);
    p_postpaid_reference_cents := COALESCE(p_postpaid_reference_cents, v_old.postpaid_reference_cents);
    IF p_max_bp < 0 OR p_max_bp > 10000 THEN RAISE EXCEPTION 'O teto precisa ficar entre 0%% e 100%%.'; END IF;
    IF p_postpaid_reference_cents <= 0 THEN RAISE EXCEPTION 'O valor de referência do pós-pago precisa ser positivo.'; END IF;
    SELECT GREATEST(max(commission_prepaid_bp), max(commission_postpaid_bp)) INTO v_top FROM public.network_levels;
    IF v_top > p_max_bp THEN
        RAISE EXCEPTION 'Existe nível com % %%. Reduza os níveis antes de baixar o teto para % %%.', round(v_top / 100.0, 2), round(p_max_bp / 100.0, 2);
    END IF;
    UPDATE public.network_settings SET max_commission_bp = p_max_bp, postpaid_reference_cents = p_postpaid_reference_cents,
                                       updated_at = now(), updated_by = p_admin WHERE id;
    PERFORM public._log(p_admin, NULL, 'network_settings_changed', 'network_settings', NULL,
                        to_jsonb(v_old), jsonb_build_object('max_commission_bp', p_max_bp, 'postpaid_reference_cents', p_postpaid_reference_cents), NULL);
END $$;

-- Conceder nível manualmente (só ELEVA; o histórico guarda o nível efetivo antes e depois)
CREATE OR REPLACE FUNCTION public.admin_grant_level(p_admin uuid, p_user uuid, p_level_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before uuid; v_after uuid; v_old uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN RAISE EXCEPTION 'Pessoa não encontrada.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.network_levels WHERE id = p_level_id AND is_active) THEN
        RAISE EXCEPTION 'Esse nível não existe ou está desativado.';
    END IF;
    INSERT INTO public.user_network_state (user_id) VALUES (p_user) ON CONFLICT DO NOTHING;
    v_before := public._effective_level_id(p_user);
    SELECT manual_level_id INTO v_old FROM public.user_network_state WHERE user_id = p_user FOR UPDATE;
    UPDATE public.user_network_state
       SET manual_level_id = p_level_id, level_achieved_at = COALESCE(level_achieved_at, now()), updated_at = now()
     WHERE user_id = p_user;
    v_after := public._effective_level_id(p_user);
    INSERT INTO public.user_level_history (user_id, previous_level_id, new_level_id, change_type, reason, changed_by)
    VALUES (p_user, v_before, v_after, 'manual_grant', NULLIF(btrim(COALESCE(p_reason, '')), ''), p_admin);
    PERFORM public._log(p_admin, p_user, 'level_granted', 'user_network_state', NULL, to_jsonb(v_old), to_jsonb(p_level_id), p_reason);
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_manual_level(p_admin uuid, p_user uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before uuid; v_after uuid; v_old uuid;
BEGIN
    SELECT manual_level_id INTO v_old FROM public.user_network_state WHERE user_id = p_user FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'Essa pessoa não tem nível concedido manualmente.'; END IF;
    v_before := public._effective_level_id(p_user);
    UPDATE public.user_network_state SET manual_level_id = NULL, updated_at = now() WHERE user_id = p_user;
    v_after := public._effective_level_id(p_user);
    INSERT INTO public.user_level_history (user_id, previous_level_id, new_level_id, change_type, reason, changed_by)
    VALUES (p_user, v_before, v_after, 'admin_change', COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), 'Concessão manual removida'), p_admin);
    PERFORM public._log(p_admin, p_user, 'level_grant_removed', 'user_network_state', NULL, to_jsonb(v_old), NULL, p_reason);
END $$;

-- Comissão personalizada (independente do nível: o NOME da graduação não muda)
CREATE OR REPLACE FUNCTION public.admin_set_custom_commission(p_admin uuid, p_user uuid, p_prepaid_bp integer, p_postpaid_bp integer, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max integer; v_old public.user_network_state;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN RAISE EXCEPTION 'Pessoa não encontrada.'; END IF;
    IF p_prepaid_bp IS NULL AND p_postpaid_bp IS NULL THEN RAISE EXCEPTION 'Informe a comissão do pré-pago, do pós-pago ou das duas.'; END IF;
    SELECT max_commission_bp INTO v_max FROM public.network_settings WHERE id;
    IF p_prepaid_bp < 0 OR p_postpaid_bp < 0 OR p_prepaid_bp > v_max OR p_postpaid_bp > v_max THEN
        RAISE EXCEPTION 'A comissão personalizada precisa ficar entre 0%% e % %% (teto do sistema).', round(v_max / 100.0, 2);
    END IF;
    INSERT INTO public.user_network_state (user_id) VALUES (p_user) ON CONFLICT DO NOTHING;
    SELECT * INTO v_old FROM public.user_network_state WHERE user_id = p_user FOR UPDATE;
    UPDATE public.user_network_state
       SET custom_commission_enabled = true,
           custom_commission_prepaid_bp = p_prepaid_bp,
           custom_commission_postpaid_bp = p_postpaid_bp,
           updated_at = now()
     WHERE user_id = p_user;
    PERFORM public._log(p_admin, p_user, 'custom_commission_set', 'user_network_state', NULL,
        jsonb_build_object('enabled', v_old.custom_commission_enabled, 'prepaid_bp', v_old.custom_commission_prepaid_bp, 'postpaid_bp', v_old.custom_commission_postpaid_bp),
        jsonb_build_object('enabled', true, 'prepaid_bp', p_prepaid_bp, 'postpaid_bp', p_postpaid_bp), p_reason);
END $$;

CREATE OR REPLACE FUNCTION public.admin_clear_custom_commission(p_admin uuid, p_user uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.user_network_state;
BEGIN
    SELECT * INTO v_old FROM public.user_network_state WHERE user_id = p_user FOR UPDATE;
    IF v_old.user_id IS NULL OR NOT v_old.custom_commission_enabled THEN
        RAISE EXCEPTION 'Essa pessoa não tem comissão personalizada ativa.';
    END IF;
    UPDATE public.user_network_state
       SET custom_commission_enabled = false, custom_commission_prepaid_bp = NULL, custom_commission_postpaid_bp = NULL, updated_at = now()
     WHERE user_id = p_user;
    PERFORM public._log(p_admin, p_user, 'custom_commission_cleared', 'user_network_state', NULL,
        jsonb_build_object('enabled', true, 'prepaid_bp', v_old.custom_commission_prepaid_bp, 'postpaid_bp', v_old.custom_commission_postpaid_bp), NULL, p_reason);
END $$;

-- Lista de níveis com quantas pessoas estão em cada um
CREATE OR REPLACE FUNCTION public.admin_levels_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH eff AS (SELECT public._effective_level_id(p.id) AS lid FROM public.profiles p),
         cnt AS (SELECT lid, count(*) AS n FROM eff GROUP BY lid)
    SELECT jsonb_build_object(
        'settings', (SELECT to_jsonb(s) FROM public.network_settings s WHERE id),
        'plans', (SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name, 'price_cents', round(price * 100)::bigint)) FROM public.plans WHERE code IN ('pre_pago', 'pos_pago')),
        'levels', COALESCE((
            SELECT jsonb_agg(to_jsonb(l) || jsonb_build_object('users', COALESCE(c.n, 0)) ORDER BY l.level_order)
            FROM public.network_levels l LEFT JOIN cnt c ON c.lid = l.id
        ), '[]'::jsonb)
    );
$$;

-- Tudo sobre UMA pessoa (painel do admin)
CREATE OR REPLACE FUNCTION public.admin_get_user_graduation(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p record; v_s public.user_network_state; v_eff_pre jsonb; v_eff_pos jsonb; v_level public.network_levels; v_high public.network_levels; v_manual public.network_levels;
BEGIN
    SELECT id, name, email, "profileSlug" AS slug, avatar_url, created_at, upline_id INTO v_p FROM public.profiles WHERE id = p_user;
    IF v_p.id IS NULL THEN RAISE EXCEPTION 'Pessoa não encontrada.'; END IF;
    SELECT * INTO v_s FROM public.user_network_state WHERE user_id = p_user;
    v_eff_pre := public.get_effective_commission(p_user, 'prepaid');
    v_eff_pos := public.get_effective_commission(p_user, 'postpaid');
    SELECT * INTO v_level FROM public.network_levels WHERE id = (v_eff_pre ->> 'level_id')::uuid;
    SELECT * INTO v_high FROM public.network_levels WHERE id = v_s.highest_level_id;
    SELECT * INTO v_manual FROM public.network_levels WHERE id = v_s.manual_level_id;
    RETURN jsonb_build_object(
        'user', jsonb_build_object('id', v_p.id, 'name', v_p.name, 'email', v_p.email, 'profileSlug', v_p.slug, 'avatarUrl', v_p.avatar_url,
                                   'createdAt', v_p.created_at, 'uplineId', v_p.upline_id),
        'current_level', to_jsonb(v_level),
        'highest_level', CASE WHEN v_high.id IS NULL THEN NULL ELSE to_jsonb(v_high) END,
        'manual_level', CASE WHEN v_manual.id IS NULL THEN NULL ELSE to_jsonb(v_manual) END,
        'level_achieved_at', v_s.level_achieved_at,
        'direct_referrals', public._count_valid_directs(p_user),
        'total_network', public._count_network(p_user),
        'standard_prepaid_bp', v_level.commission_prepaid_bp,
        'standard_postpaid_bp', v_level.commission_postpaid_bp,
        'custom_enabled', COALESCE(v_s.custom_commission_enabled, false),
        'custom_prepaid_bp', v_s.custom_commission_prepaid_bp,
        'custom_postpaid_bp', v_s.custom_commission_postpaid_bp,
        'effective_prepaid', v_eff_pre,
        'effective_postpaid', v_eff_pos,
        'history', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('type', h.change_type, 'reason', h.reason, 'at', h.created_at,
                     'previous', pl.name, 'new', nl.name, 'by', cb.name) ORDER BY h.created_at DESC)
            FROM (SELECT * FROM public.user_level_history WHERE user_id = p_user ORDER BY created_at DESC LIMIT 20) h
            LEFT JOIN public.network_levels pl ON pl.id = h.previous_level_id
            LEFT JOIN public.network_levels nl ON nl.id = h.new_level_id
            LEFT JOIN public.profiles cb ON cb.id = h.changed_by
        ), '[]'::jsonb)
    );
END $$;

-- Últimos registros de auditoria (opcionalmente de uma pessoa)
CREATE OR REPLACE FUNCTION public.admin_list_system_logs(p_user uuid, p_limit integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', g.id, 'action', g.action, 'entity', g.entity, 'old', g.old_value, 'new', g.new_value, 'reason', g.reason,
        'at', g.created_at, 'actor', a.name, 'actorSlug', a."profileSlug", 'target', t.name, 'targetSlug', t."profileSlug"
    ) ORDER BY g.created_at DESC), '[]'::jsonb)
    FROM (SELECT * FROM public.system_logs WHERE p_user IS NULL OR target_user_id = p_user ORDER BY created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)) g
    LEFT JOIN public.profiles a ON a.id = g.actor_id
    LEFT JOIN public.profiles t ON t.id = g.target_user_id;
$$;

-- ============================================================================
-- ÁRVORE (um nível por vez, paginada) — função interna sem checagem de acesso + versão pública que checa
-- ============================================================================
CREATE OR REPLACE FUNCTION public._network_children(p_parent uuid, p_limit integer, p_offset integer)
RETURNS TABLE (
    id uuid, name text, profile_slug text, avatar_url text, joined_at timestamptz, is_valid boolean, direct_count integer,
    level_id uuid, level_name text, level_order integer, border_style text, border_color text, border_colors text[],
    background_style text, badge_style text, icon text,
    rate_prepaid_bp integer, rate_postpaid_bp integer, is_custom boolean, total_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT c.id, c.name, c."profileSlug", c.avatar_url, c.created_at,
           (COALESCE(c.is_active, true) AND NOT COALESCE(c.is_blocked, false)),
           public._count_valid_directs(c.id),
           l.id, l.name, l.level_order, l.border_style, l.border_color, l.border_colors, l.background_style, l.badge_style, l.icon,
           (public.get_effective_commission(c.id, 'prepaid') ->> 'commission_rate_bp')::integer,
           (public.get_effective_commission(c.id, 'postpaid') ->> 'commission_rate_bp')::integer,
           (public.get_effective_commission(c.id, 'prepaid') ->> 'is_custom')::boolean
             OR (public.get_effective_commission(c.id, 'postpaid') ->> 'is_custom')::boolean,
           count(*) OVER ()
      FROM public.profiles c
      JOIN public.network_levels l ON l.id = public._effective_level_id(c.id)
     WHERE c.upline_id = p_parent
     ORDER BY c.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- Quem logado pode abrir: a PRÓPRIA rede e qualquer descendente dela (nunca a rede de quem está acima ou ao lado)
CREATE OR REPLACE FUNCTION public.get_network_children(p_parent uuid DEFAULT NULL, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS TABLE (
    id uuid, name text, profile_slug text, avatar_url text, joined_at timestamptz, is_valid boolean, direct_count integer,
    level_id uuid, level_name text, level_order integer, border_style text, border_color text, border_colors text[],
    background_style text, badge_style text, icon text,
    rate_prepaid_bp integer, rate_postpaid_bp integer, is_custom boolean, total_count bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_parent uuid;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Faça login para ver a sua rede.' USING ERRCODE = '42501'; END IF;
    v_parent := COALESCE(p_parent, v_me);
    IF v_parent <> v_me AND NOT EXISTS (
        WITH RECURSIVE up AS (
            SELECT pr.id, pr.upline_id, 1 AS depth FROM public.profiles pr WHERE pr.id = v_parent
            UNION ALL
            SELECT pr.id, pr.upline_id, u.depth + 1 FROM public.profiles pr JOIN up u ON pr.id = u.upline_id WHERE u.depth < 50
        )
        SELECT 1 FROM up WHERE up.id = v_me AND up.id <> v_parent
    ) THEN
        RAISE EXCEPTION 'Você só pode ver a sua própria rede.' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY SELECT * FROM public._network_children(v_parent, p_limit, p_offset);
END $$;

-- ============================================================================
-- ÁREA DO USUÁRIO
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_my_graduation()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me uuid := auth.uid();
    v_s public.user_network_state;
    v_level public.network_levels;
    v_high public.network_levels;
    v_next public.network_levels;
    v_pre jsonb; v_pos jsonb;
    v_directs integer;
    v_settings public.network_settings;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Faça login para ver a sua graduação.' USING ERRCODE = '42501'; END IF;
    PERFORM public.check_and_upgrade_user_level(v_me);   -- garante que o nível está em dia
    SELECT * INTO v_s FROM public.user_network_state WHERE user_id = v_me;
    SELECT * INTO v_settings FROM public.network_settings WHERE id;
    v_pre := public.get_effective_commission(v_me, 'prepaid');
    v_pos := public.get_effective_commission(v_me, 'postpaid');
    SELECT * INTO v_level FROM public.network_levels WHERE id = (v_pre ->> 'level_id')::uuid;
    SELECT * INTO v_high FROM public.network_levels WHERE id = COALESCE(v_s.highest_level_id, public._initial_level_id());
    SELECT * INTO v_next FROM public.network_levels WHERE is_active AND level_order > v_level.level_order ORDER BY level_order LIMIT 1;
    v_directs := public._count_valid_directs(v_me);

    RETURN jsonb_build_object(
        'level', to_jsonb(v_level),
        'highest_level', to_jsonb(v_high),
        'level_achieved_at', v_s.level_achieved_at,
        'direct_referrals', v_directs,
        'total_network', public._count_network(v_me),
        'standard_prepaid_bp', v_level.commission_prepaid_bp,
        'standard_postpaid_bp', v_level.commission_postpaid_bp,
        'has_custom', COALESCE(v_s.custom_commission_enabled, false),
        'custom_prepaid_bp', v_s.custom_commission_prepaid_bp,
        'custom_postpaid_bp', v_s.custom_commission_postpaid_bp,
        'effective_prepaid', v_pre,
        'effective_postpaid', v_pos,
        'next_level', CASE WHEN v_next.id IS NULL THEN NULL ELSE to_jsonb(v_next) END,
        'progress_percent', CASE WHEN v_next.id IS NULL THEN 100
                                 WHEN v_next.min_direct_referrals <= 0 THEN 100
                                 ELSE LEAST(100, floor(v_directs * 100.0 / v_next.min_direct_referrals)) END,
        'levels', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.level_order) FROM public.network_levels l WHERE l.is_active), '[]'::jsonb),
        'prepaid_price_cents', (SELECT round(price * 100)::bigint FROM public.plans WHERE code = 'pre_pago'),
        'postpaid_reference_cents', v_settings.postpaid_reference_cents,
        'history', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('type', h.change_type, 'reason', h.reason, 'at', h.created_at, 'previous', pl.name, 'new', nl.name) ORDER BY h.created_at DESC)
            FROM (SELECT * FROM public.user_level_history WHERE user_id = v_me ORDER BY created_at DESC LIMIT 10) h
            LEFT JOIN public.network_levels pl ON pl.id = h.previous_level_id
            LEFT JOIN public.network_levels nl ON nl.id = h.new_level_id
        ), '[]'::jsonb)
    );
END $$;

-- Minhas comissões (painel de ganhos)
CREATE OR REPLACE FUNCTION public.get_my_commissions(p_limit integer DEFAULT 30)
RETURNS TABLE (
    id uuid, created_at timestamptz, plan_type text, base_amount_cents bigint, commission_rate_bp integer, commission_amount_cents bigint,
    level_name text, is_custom boolean, commission_source text, status text, source_name text, source_slug text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT c.id, c.created_at, c.plan_type, c.base_amount_cents, c.commission_rate_bp, c.commission_amount_cents,
           c.level_name_snapshot, c.is_custom_commission, c.commission_source, c.status, p.name, p."profileSlug"
      FROM public.commissions c LEFT JOIN public.profiles p ON p.id = c.source_user_id
     WHERE c.user_id = auth.uid()
     ORDER BY c.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 200);
$$;

-- Visual do nível de qualquer pessoa (só aparência — nada de percentual) pra mostrar borda/selo em qualquer lugar
CREATE OR REPLACE FUNCTION public.get_levels_for(p_ids uuid[])
RETURNS TABLE (user_id uuid, level_id uuid, level_name text, level_order integer, border_style text, border_color text,
               border_colors text[], background_style text, badge_style text, icon text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, l.id, l.name, l.level_order, l.border_style, l.border_color, l.border_colors, l.background_style, l.badge_style, l.icon
      FROM public.profiles p JOIN public.network_levels l ON l.id = public._effective_level_id(p.id)
     WHERE p.id = ANY (p_ids[1:200]);
$$;

-- ============================================================================
-- Permissões de execução
-- ============================================================================
REVOKE ALL ON FUNCTION
    public._log(uuid, uuid, text, text, uuid, jsonb, jsonb, text),
    public._initial_level_id(), public._count_valid_directs(uuid), public._count_network(uuid),
    public._level_requirements_met(uuid, public.network_levels), public._effective_level_id(uuid),
    public.get_effective_commission(uuid, text), public.commission_cents(bigint, integer),
    public.check_and_upgrade_user_level(uuid), public.recheck_all_levels(),
    public.record_referral_commission(uuid, text, bigint, text, uuid, uuid), public._validate_levels(),
    public.admin_upsert_level(uuid, uuid, jsonb), public.admin_reorder_levels(uuid, uuid[]),
    public.admin_set_network_settings(uuid, integer, integer), public.admin_grant_level(uuid, uuid, uuid, text),
    public.admin_remove_manual_level(uuid, uuid, text), public.admin_set_custom_commission(uuid, uuid, integer, integer, text),
    public.admin_clear_custom_commission(uuid, uuid, text), public.admin_levels_overview(), public.admin_get_user_graduation(uuid),
    public.admin_list_system_logs(uuid, integer), public._network_children(uuid, integer, integer)
FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public._log(uuid, uuid, text, text, uuid, jsonb, jsonb, text),
    public._initial_level_id(), public._count_valid_directs(uuid), public._count_network(uuid),
    public._level_requirements_met(uuid, public.network_levels), public._effective_level_id(uuid),
    public.get_effective_commission(uuid, text), public.commission_cents(bigint, integer),
    public.check_and_upgrade_user_level(uuid), public.recheck_all_levels(),
    public.record_referral_commission(uuid, text, bigint, text, uuid, uuid), public._validate_levels(),
    public.admin_upsert_level(uuid, uuid, jsonb), public.admin_reorder_levels(uuid, uuid[]),
    public.admin_set_network_settings(uuid, integer, integer), public.admin_grant_level(uuid, uuid, uuid, text),
    public.admin_remove_manual_level(uuid, uuid, text), public.admin_set_custom_commission(uuid, uuid, integer, integer, text),
    public.admin_clear_custom_commission(uuid, uuid, text), public.admin_levels_overview(), public.admin_get_user_graduation(uuid),
    public.admin_list_system_logs(uuid, integer), public._network_children(uuid, integer, integer)
TO service_role;

REVOKE ALL ON FUNCTION public.get_my_graduation(), public.get_network_children(uuid, integer, integer), public.get_my_commissions(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_graduation(), public.get_network_children(uuid, integer, integer), public.get_my_commissions(integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_levels_for(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_levels_for(uuid[]) TO anon, authenticated, service_role;

-- ============================================================================
-- DADOS INICIAIS
-- ============================================================================
INSERT INTO public.network_levels (name, level_order, commission_prepaid_bp, commission_postpaid_bp, min_direct_referrals,
                                   border_style, border_color, border_colors, background_style, badge_style, icon, description)
SELECT * FROM (VALUES
    ('Inicial',  1, 4000, 4000,  0, 'solid',   '#94a3b8', ARRAY[]::text[],                                         'none',     'pill',   NULL::text, 'Todo mundo começa aqui.'),
    ('Bronze',   2, 5000, 5000,  5, 'solid',   '#CD7F32', ARRAY[]::text[],                                         'soft',     'pill',   NULL,       'Chegou a 5 indicados.'),
    ('Prata',    3, 5500, 5500, 10, 'double',  '#C0C0C0', ARRAY[]::text[],                                         'soft',     'shield', NULL,       'Chegou a 10 indicados.'),
    ('Ouro',     4, 6000, 6000, 15, 'glow',    '#F5C518', ARRAY[]::text[],                                         'soft',     'shield', NULL,       'Chegou a 15 indicados.'),
    ('Diamante', 5, 7000, 7000, 20, 'diamond', '#7dd3fc', ARRAY['#67e8f9', '#a5b4fc', '#f0abfc', '#67e8f9'],        'gradient', 'ribbon', NULL,       'Chegou a 20 indicados — o topo da graduação.')
) AS v(name, level_order, commission_prepaid_bp, commission_postpaid_bp, min_direct_referrals, border_style, border_color, border_colors, background_style, badge_style, icon, description)
WHERE NOT EXISTS (SELECT 1 FROM public.network_levels);

-- Pré-pago passa a R$ 100,00 (antes R$ 99,00). A Asaas não recobra assinaturas existentes; hoje não há pagamento real
-- registrado, então nada muda pra quem já paga. O pós-pago continua sem mensalidade (quitação por Pix, R$ 50).
UPDATE public.plans SET price = 100.00 WHERE code = 'pre_pago' AND price = 99.00;

-- Quem já indica sobe pro nível que merece (ninguém perde nada: antes todos ganhavam 50% fixo)
SELECT public.recheck_all_levels();
