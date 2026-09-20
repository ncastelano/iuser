-- Hierarquia + permissões + escopo (substitui o "Líder Motorista" fixo).
--
--   PLANO      = o que a pessoa USA                    (plans / subscriptions)
--   STATUS     = posição na hierarquia                 (user_statuses, profiles.status_id)
--   PERMISSÃO  = o que ela PODE FAZER                  (permissions, status_permissions, user_permissions)
--   ESCOPO     = SOBRE QUEM / ONDE                      (scope na permissão)
--   CONCESSÃO  = evento de dar um plano a outra pessoa (subscriptions + grant_audit_logs)
--
-- Uma concessão continua sendo uma linha de subscriptions (é ela que
-- get_active_plan_grants lê, com expiração por current_period_end). O
-- histórico de todas as concessões (e das negadas) fica em grant_audit_logs.

-- ============================================================
-- 1. STATUS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]{2,40}$'),
    name TEXT NOT NULL,
    level INTEGER NOT NULL CHECK (level >= 0),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. PERMISSÕES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]{2,60}$'),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Permissões que cada STATUS dá por padrão, cada uma com seu escopo.
CREATE TABLE IF NOT EXISTS public.status_permissions (
    status_id UUID NOT NULL REFERENCES public.user_statuses(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('direct_invite', 'direct_downline', 'network', 'all')),
    PRIMARY KEY (status_id, permission_id)
);

-- Exceções por pessoa: 'grant' soma uma permissão além do status, 'revoke'
-- tira uma que o status daria. Dois usuários com o mesmo status podem ter
-- permissões diferentes.
CREATE TABLE IF NOT EXISTS public.user_permissions (
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    effect TEXT NOT NULL CHECK (effect IN ('grant', 'revoke')),
    scope TEXT CHECK (scope IN ('direct_invite', 'direct_downline', 'network', 'all')),
    expires_at TIMESTAMPTZ,
    granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, permission_id),
    CHECK (effect = 'revoke' OR scope IS NOT NULL)
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status_id UUID REFERENCES public.user_statuses(id) ON DELETE SET NULL;

-- ============================================================
-- 3. PLANOS: quais podem ser concedidos e qual permissão exige
-- ============================================================
ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS grantable BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS grant_permission TEXT REFERENCES public.permissions(slug) ON UPDATE CASCADE ON DELETE SET NULL;

-- ============================================================
-- 4. CONCESSÃO: metadados na própria assinatura
-- ============================================================
ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS granted_reason TEXT;

-- ============================================================
-- 5. AUDITORIA (só as funções SECURITY DEFINER escrevem/leem)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.grant_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL CHECK (action IN ('grant_plan', 'set_status')),
    outcome TEXT NOT NULL CHECK (outcome IN ('granted', 'denied')),
    denial_reason TEXT,
    actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_status_id UUID REFERENCES public.user_statuses(id) ON DELETE SET NULL,
    actor_status_slug TEXT,
    target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
    plan_code TEXT,
    permission_used TEXT,
    scope_used TEXT,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grant_audit_logs_actor_idx ON public.grant_audit_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS grant_audit_logs_target_idx ON public.grant_audit_logs (target_user_id, created_at DESC);

ALTER TABLE public.user_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_audit_logs ENABLE ROW LEVEL SECURITY;

-- Catálogo (não sensível): qualquer logado lê. Escrita só service role.
DROP POLICY IF EXISTS "Logado lê status" ON public.user_statuses;
CREATE POLICY "Logado lê status" ON public.user_statuses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Logado lê permissões" ON public.permissions;
CREATE POLICY "Logado lê permissões" ON public.permissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Logado lê permissões por status" ON public.status_permissions;
CREATE POLICY "Logado lê permissões por status" ON public.status_permissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Usuário vê suas exceções de permissão" ON public.user_permissions;
CREATE POLICY "Usuário vê suas exceções de permissão" ON public.user_permissions FOR SELECT TO authenticated USING (auth.uid() = profile_id);
-- grant_audit_logs: sem policy — leitura só pelas funções abaixo.

-- ============================================================
-- 6. DADOS INICIAIS
-- ============================================================
INSERT INTO public.user_statuses (slug, name, level, description) VALUES
    ('usuario', 'Usuário', 0, 'Usuário comum, sem poderes de gestão.'),
    ('lider', 'Líder', 1, 'Concede benefícios para quem convidou diretamente.'),
    ('supervisor', 'Supervisor', 2, 'Concede benefícios dentro da própria estrutura.'),
    ('gestor', 'Gestor', 3, 'Concede a maioria dos benefícios dentro da própria estrutura.'),
    ('administrador', 'Administrador', 4, 'Administra toda a plataforma.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.permissions (slug, name, description) VALUES
    ('grant_driver_plan', 'Conceder Motorista', 'Conceder os planos de motorista.'),
    ('grant_provider_plan', 'Conceder Prestador', 'Conceder o plano de prestador de serviço.'),
    ('grant_store_plan', 'Conceder Loja', 'Conceder o plano de loja.'),
    ('grant_recruiter_plan', 'Conceder Recrutador', 'Conceder o plano de recrutador.'),
    ('grant_combo_plan', 'Conceder Combo', 'Conceder o plano combo.'),
    ('grant_any_plan', 'Conceder qualquer plano', 'Conceder qualquer plano habilitado para concessão.'),
    ('manage_users', 'Gerenciar usuários', 'Gerenciar usuários da plataforma.'),
    ('manage_leaders', 'Gerenciar líderes', 'Definir o status hierárquico de outras pessoas.'),
    ('view_network', 'Ver rede', 'Visualizar a própria estrutura.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.status_permissions (status_id, permission_id, scope)
SELECT s.id, p.id, v.scope
FROM (VALUES
    ('lider',         'grant_driver_plan',    'direct_invite'),
    ('supervisor',    'grant_driver_plan',    'network'),
    ('supervisor',    'grant_provider_plan',  'network'),
    ('supervisor',    'grant_store_plan',     'network'),
    ('gestor',        'grant_driver_plan',    'network'),
    ('gestor',        'grant_provider_plan',  'network'),
    ('gestor',        'grant_store_plan',     'network'),
    ('gestor',        'grant_recruiter_plan', 'network'),
    ('gestor',        'grant_combo_plan',     'network'),
    ('administrador', 'grant_any_plan',       'all'),
    ('administrador', 'manage_users',         'all'),
    ('administrador', 'manage_leaders',       'all'),
    ('administrador', 'view_network',         'all')
) AS v(status_slug, perm_slug, scope)
JOIN public.user_statuses s ON s.slug = v.status_slug
JOIN public.permissions p ON p.slug = v.perm_slug
ON CONFLICT (status_id, permission_id) DO NOTHING;

-- Quais planos podem ser concedidos e por qual permissão. Pós-pago e Beta
-- (retirado) ficam de fora: pós-pago exige CPF/aparelho únicos na ativação.
UPDATE public.plans SET grantable = true, grant_permission = 'grant_driver_plan'    WHERE code IN ('motorista', 'motorista_beta');
UPDATE public.plans SET grantable = true, grant_permission = 'grant_provider_plan'  WHERE code = 'prestador';
UPDATE public.plans SET grantable = true, grant_permission = 'grant_store_plan'     WHERE code = 'loja';
UPDATE public.plans SET grantable = true, grant_permission = 'grant_recruiter_plan' WHERE code = 'recrutador';
UPDATE public.plans SET grantable = true, grant_permission = 'grant_combo_plan'     WHERE code = 'combo';

-- ============================================================
-- 7. MIGRAÇÃO DO LÍDER MOTORISTA e do administrador
-- ============================================================
-- Quem era is_lider_motorista vira Líder (grant_driver_plan @ direct_invite,
-- dado pelo status). A coluna antiga fica só por compatibilidade: nada mais
-- a lê; pode ser removida numa migration futura.
UPDATE public.profiles
SET status_id = (SELECT id FROM public.user_statuses WHERE slug = 'lider')
WHERE is_lider_motorista = true AND status_id IS NULL;

UPDATE public.profiles
SET status_id = (SELECT id FROM public.user_statuses WHERE slug = 'administrador')
WHERE id IN (SELECT id FROM auth.users WHERE email = 'ncastelano@gmail.com');

COMMENT ON COLUMN public.profiles.is_lider_motorista IS
    'DEPRECADO: substituído por profiles.status_id + permissões (user_statuses/status_permissions). Mantido só por compatibilidade.';
COMMENT ON COLUMN public.plans.leader_grantable IS
    'DEPRECADO: substituído por plans.grantable + plans.grant_permission.';

-- ============================================================
-- 8. FUNÇÕES DE AUTORIZAÇÃO (fonte única de verdade)
-- ============================================================
CREATE OR REPLACE FUNCTION public._scope_rank(p_scope text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE p_scope
        WHEN 'all' THEN 4
        WHEN 'network' THEN 3
        WHEN 'direct_downline' THEN 2
        WHEN 'direct_invite' THEN 1
        ELSE 0
    END;
$$;

-- Status efetivo (id, slug, level). O e-mail de administrador geral, se
-- ainda sem status, conta como Administrador (evita se trancar pra fora).
CREATE OR REPLACE FUNCTION public._actor_status(p_user uuid)
RETURNS TABLE(status_id uuid, slug text, name text, level integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
    v_email text;
    v_status uuid;
BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user;
    SELECT pr.status_id INTO v_status FROM public.profiles pr WHERE pr.id = p_user;
    IF v_status IS NULL THEN
        SELECT s.id INTO v_status FROM public.user_statuses s
        WHERE s.slug = CASE WHEN v_email = 'ncastelano@gmail.com' THEN 'administrador' ELSE 'usuario' END;
    END IF;
    RETURN QUERY
        SELECT s.id, s.slug, s.name, s.level FROM public.user_statuses s
        WHERE s.id = v_status AND s.is_active;
END;
$$;

-- Permissões efetivas: as do status + exceções 'grant' (não expiradas) −
-- exceções 'revoke'. Se a mesma permissão aparece mais de uma vez, vale o
-- escopo mais amplo.
CREATE OR REPLACE FUNCTION public.get_effective_permissions(p_user uuid)
RETURNS TABLE(permission text, scope text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
    v_status uuid;
BEGIN
    SELECT st.status_id INTO v_status FROM public._actor_status(p_user) st;

    RETURN QUERY
    WITH base AS (
        SELECT p.slug AS perm, sp.scope AS sc
        FROM public.status_permissions sp
        JOIN public.permissions p ON p.id = sp.permission_id
        WHERE sp.status_id = v_status
        UNION ALL
        SELECT p.slug, up.scope
        FROM public.user_permissions up
        JOIN public.permissions p ON p.id = up.permission_id
        WHERE up.profile_id = p_user AND up.effect = 'grant'
          AND (up.expires_at IS NULL OR up.expires_at > now())
    ),
    revoked AS (
        SELECT p.slug AS perm
        FROM public.user_permissions up
        JOIN public.permissions p ON p.id = up.permission_id
        WHERE up.profile_id = p_user AND up.effect = 'revoke'
          AND (up.expires_at IS NULL OR up.expires_at > now())
    )
    SELECT b.perm, (array_agg(b.sc ORDER BY public._scope_rank(b.sc) DESC))[1]
    FROM base b
    WHERE b.perm NOT IN (SELECT perm FROM revoked)
    GROUP BY b.perm;
END;
$$;

-- hasPermission: permissão específica OU grant_any_plan (só pra grant_*).
CREATE OR REPLACE FUNCTION public.has_permission(p_user uuid, p_permission text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.get_effective_permissions(p_user) e
        WHERE e.permission = p_permission
           OR (e.permission = 'grant_any_plan' AND p_permission LIKE 'grant\_%')
    );
$$;

-- Escopo mais amplo que a pessoa tem pra essa permissão (null = não tem).
CREATE OR REPLACE FUNCTION public.get_permission_scope(p_user uuid, p_permission text)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT e.scope FROM public.get_effective_permissions(p_user) e
    WHERE e.permission = p_permission
       OR (e.permission = 'grant_any_plan' AND p_permission LIKE 'grant\_%')
    ORDER BY public._scope_rank(e.scope) DESC
    LIMIT 1;
$$;

-- O alvo está dentro do escopo? (o próprio ator nunca está)
CREATE OR REPLACE FUNCTION public.is_in_scope(p_actor uuid, p_target uuid, p_scope text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
BEGIN
    IF p_actor IS NULL OR p_target IS NULL OR p_actor = p_target THEN RETURN false; END IF;

    IF p_scope = 'all' THEN
        RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target);
    ELSIF p_scope IN ('direct_invite', 'direct_downline') THEN
        RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target AND upline_id = p_actor);
    ELSIF p_scope = 'network' THEN
        -- Sobe a cadeia de convites a partir do alvo; se o ator aparece
        -- como upline em algum ponto, o alvo é da estrutura dele.
        RETURN EXISTS (
            WITH RECURSIVE chain AS (
                SELECT id, upline_id, 1 AS depth FROM public.profiles WHERE id = p_target
                UNION ALL
                SELECT pr.id, pr.upline_id, c.depth + 1
                FROM public.profiles pr JOIN chain c ON pr.id = c.upline_id
                WHERE c.depth < 20
            )
            SELECT 1 FROM chain WHERE upline_id = p_actor
        );
    END IF;
    RETURN false;
END;
$$;

-- canActOnUser
CREATE OR REPLACE FUNCTION public.can_act_on_user(p_actor uuid, p_target uuid, p_permission text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
    v_scope text;
BEGIN
    v_scope := public.get_permission_scope(p_actor, p_permission);
    IF v_scope IS NULL THEN RETURN false; END IF;
    RETURN public.is_in_scope(p_actor, p_target, v_scope);
END;
$$;

-- Qual permissão/escopo autoriza esse ator a conceder esse plano (null = nenhum)?
CREATE OR REPLACE FUNCTION public.resolve_grant_authority(p_actor uuid, p_plan_id uuid)
RETURNS TABLE(permission text, scope text)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT e.permission, e.scope
    FROM public.get_effective_permissions(p_actor) e
    JOIN public.plans pl ON pl.id = p_plan_id AND pl.grantable
    WHERE e.permission = 'grant_any_plan' OR e.permission = pl.grant_permission
    ORDER BY public._scope_rank(e.scope) DESC, (e.permission = pl.grant_permission) DESC
    LIMIT 1;
$$;

-- canGrantPlan (independente do alvo)
CREATE OR REPLACE FUNCTION public.can_grant_plan(p_actor uuid, p_plan_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT EXISTS (SELECT 1 FROM public.resolve_grant_authority(p_actor, p_plan_id));
$$;

-- getGrantablePlans
CREATE OR REPLACE FUNCTION public.get_grantable_plans(p_actor uuid)
RETURNS TABLE(
    id uuid, code text, name text, description text, price numeric,
    permission_used text, scope text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT pl.id, pl.code, pl.name, pl.description, pl.price, a.permission, a.scope
    FROM public.plans pl
    CROSS JOIN LATERAL public.resolve_grant_authority(p_actor, pl.id) a
    ORDER BY pl.price, pl.name;
$$;

-- ============================================================
-- 9. AUDITORIA
-- ============================================================
CREATE OR REPLACE FUNCTION public._log_grant_event(
    p_action text, p_outcome text, p_denial text,
    p_actor uuid, p_target uuid, p_plan_id uuid, p_plan_code text,
    p_permission text, p_scope text, p_subscription uuid,
    p_starts timestamptz, p_expires timestamptz, p_reason text, p_metadata jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_status_id uuid;
    v_status_slug text;
BEGIN
    SELECT st.status_id, st.slug INTO v_status_id, v_status_slug FROM public._actor_status(p_actor) st;
    INSERT INTO public.grant_audit_logs (
        action, outcome, denial_reason, actor_user_id, actor_status_id, actor_status_slug,
        target_user_id, plan_id, plan_code, permission_used, scope_used, subscription_id,
        starts_at, expires_at, reason, metadata
    ) VALUES (
        p_action, p_outcome, p_denial,
        (SELECT id FROM public.profiles WHERE id = p_actor), v_status_id, v_status_slug,
        (SELECT id FROM public.profiles WHERE id = p_target), p_plan_id, p_plan_code, p_permission, p_scope, p_subscription,
        p_starts, p_expires, p_reason, COALESCE(p_metadata, '{}'::jsonb)
    ) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ============================================================
-- 10. CONCESSÃO CENTRAL (única porta de entrada)
-- ============================================================
-- Sempre devolve jsonb {ok, code, message,...} em vez de lançar exceção,
-- assim a tentativa NEGADA também fica registrada na auditoria.
CREATE OR REPLACE FUNCTION public.grant_plan_internal(
    p_actor uuid, p_target uuid, p_plan_id uuid, p_days integer, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_plan public.plans;
    v_perm text;
    v_scope text;
    v_level integer;
    v_existing public.subscriptions;
    v_sub public.subscriptions;
    v_now timestamptz := now();
    v_end timestamptz;
    v_source text;
    v_count integer;
    v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');

    -- devolve a negação já auditada
    v_deny_code text;
    v_deny_msg text;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'unauthenticated', 'message', 'Não autenticado');
    END IF;

    SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;

    <<checks>>
    BEGIN
        IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN
            v_deny_code := 'invalid_duration'; v_deny_msg := 'Duração inválida'; EXIT checks;
        END IF;
        IF p_target IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target) THEN
            v_deny_code := 'target_not_found'; v_deny_msg := 'Pessoa não encontrada'; EXIT checks;
        END IF;
        IF p_target = p_actor THEN
            v_deny_code := 'self_grant_denied'; v_deny_msg := 'Você não pode conceder um benefício para si mesmo'; EXIT checks;
        END IF;
        IF v_plan.id IS NULL THEN
            v_deny_code := 'plan_not_found'; v_deny_msg := 'Plano não encontrado'; EXIT checks;
        END IF;
        IF NOT v_plan.grantable THEN
            v_deny_code := 'plan_not_grantable'; v_deny_msg := 'Esse plano não pode ser concedido'; EXIT checks;
        END IF;

        SELECT a.permission, a.scope INTO v_perm, v_scope FROM public.resolve_grant_authority(p_actor, p_plan_id) a;
        IF v_perm IS NULL THEN
            v_deny_code := 'permission_denied'; v_deny_msg := 'Você não tem permissão para conceder esse plano'; EXIT checks;
        END IF;
        IF NOT public.is_in_scope(p_actor, p_target, v_scope) THEN
            v_deny_code := 'out_of_scope'; v_deny_msg := 'Essa pessoa está fora do seu escopo'; EXIT checks;
        END IF;

        SELECT * INTO v_existing FROM public.subscriptions
        WHERE user_id = p_target AND plan_id = p_plan_id AND status IN ('pending', 'active')
        FOR UPDATE;

        -- Não sobrescreve uma assinatura paga em vigor (quebraria a renovação).
        IF v_existing.id IS NOT NULL AND v_existing.source = 'asaas' AND v_existing.status = 'active'
           AND v_existing.current_period_end > v_now THEN
            v_deny_code := 'already_subscribed'; v_deny_msg := 'Essa pessoa já tem esse plano pago ativo'; EXIT checks;
        END IF;

        IF v_plan.max_active_subscriptions IS NOT NULL AND v_existing.id IS NULL THEN
            PERFORM pg_advisory_xact_lock(hashtext('plan_slots:' || v_plan.id::text));
            SELECT count(*) INTO v_count FROM public.subscriptions WHERE plan_id = v_plan.id AND status IN ('pending', 'active');
            IF v_count >= v_plan.max_active_subscriptions THEN
                v_deny_code := 'slots_full'; v_deny_msg := 'Vagas desse plano esgotadas'; EXIT checks;
            END IF;
        END IF;
    END;

    IF v_deny_code IS NOT NULL THEN
        PERFORM public._log_grant_event('grant_plan', 'denied', v_deny_code, p_actor, p_target, v_plan.id, v_plan.code,
                                        v_perm, v_scope, NULL, NULL, NULL, v_reason, '{}'::jsonb);
        RETURN jsonb_build_object('ok', false, 'code', v_deny_code, 'message', v_deny_msg);
    END IF;

    SELECT st.level INTO v_level FROM public._actor_status(p_actor) st;
    v_source := CASE WHEN COALESCE(v_level, 0) >= 4 THEN 'admin_grant' ELSE 'leader_grant' END;
    v_end := v_now + make_interval(days => p_days);

    BEGIN
        IF v_existing.id IS NOT NULL THEN
            UPDATE public.subscriptions
            SET status = 'active', source = v_source, current_period_end = v_end,
                starts_at = v_now, granted_by = p_actor, granted_reason = v_reason, updated_at = v_now
            WHERE id = v_existing.id
            RETURNING * INTO v_sub;
        ELSE
            INSERT INTO public.subscriptions (user_id, plan_id, status, source, current_period_end, starts_at, granted_by, granted_reason)
            VALUES (p_target, p_plan_id, 'active', v_source, v_end, v_now, p_actor, v_reason)
            RETURNING * INTO v_sub;
        END IF;
    EXCEPTION WHEN unique_violation THEN
        PERFORM public._log_grant_event('grant_plan', 'denied', 'conflict', p_actor, p_target, v_plan.id, v_plan.code,
                                        v_perm, v_scope, NULL, NULL, NULL, v_reason, '{}'::jsonb);
        RETURN jsonb_build_object('ok', false, 'code', 'conflict', 'message', 'Conflito ao conceder, tente de novo');
    END;

    PERFORM public._log_grant_event('grant_plan', 'granted', NULL, p_actor, p_target, v_plan.id, v_plan.code,
                                    v_perm, v_scope, v_sub.id, v_now, v_end, v_reason,
                                    jsonb_build_object('days', p_days, 'source', v_source));

    RETURN jsonb_build_object('ok', true, 'subscription_id', v_sub.id, 'starts_at', v_now, 'expires_at', v_end);
END;
$$;

-- ============================================================
-- 11. STATUS DE OUTRAS PESSOAS (manage_leaders)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_user_status_internal(p_actor uuid, p_target uuid, p_status_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_status public.user_statuses;
    v_actor_level integer;
    v_target_level integer;
    v_deny_code text;
    v_deny_msg text;
BEGIN
    SELECT * INTO v_status FROM public.user_statuses WHERE slug = p_status_slug AND is_active;
    SELECT st.level INTO v_actor_level FROM public._actor_status(p_actor) st;
    SELECT st.level INTO v_target_level FROM public._actor_status(p_target) st;

    IF p_target IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target) THEN
        v_deny_code := 'target_not_found'; v_deny_msg := 'Pessoa não encontrada';
    ELSIF v_status.id IS NULL THEN
        v_deny_code := 'status_not_found'; v_deny_msg := 'Status não encontrado';
    ELSIF NOT public.has_permission(p_actor, 'manage_leaders') THEN
        v_deny_code := 'permission_denied'; v_deny_msg := 'Você não pode gerenciar status';
    ELSIF p_actor = p_target THEN
        v_deny_code := 'self_change_denied'; v_deny_msg := 'Você não pode alterar o próprio status';
    ELSIF COALESCE(v_actor_level, 0) < 4 AND (v_status.level >= COALESCE(v_actor_level, 0) OR COALESCE(v_target_level, 0) >= COALESCE(v_actor_level, 0)) THEN
        v_deny_code := 'level_denied'; v_deny_msg := 'Você só gerencia status abaixo do seu nível';
    ELSIF NOT public.can_act_on_user(p_actor, p_target, 'manage_leaders') THEN
        v_deny_code := 'out_of_scope'; v_deny_msg := 'Essa pessoa está fora do seu escopo';
    END IF;

    IF v_deny_code IS NOT NULL THEN
        PERFORM public._log_grant_event('set_status', 'denied', v_deny_code, p_actor, p_target, NULL, NULL,
                                        'manage_leaders', NULL, NULL, NULL, NULL, NULL,
                                        jsonb_build_object('status_slug', p_status_slug));
        RETURN jsonb_build_object('ok', false, 'code', v_deny_code, 'message', v_deny_msg);
    END IF;

    UPDATE public.profiles SET status_id = v_status.id WHERE id = p_target;
    PERFORM public._log_grant_event('set_status', 'granted', NULL, p_actor, p_target, NULL, NULL,
                                    'manage_leaders', public.get_permission_scope(p_actor, 'manage_leaders'), NULL, NULL, NULL, NULL,
                                    jsonb_build_object('status_slug', p_status_slug));
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 12. FUNÇÕES PARA O CLIENTE (sempre travadas em auth.uid())
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_status()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_status record;
BEGIN
    IF v_uid IS NULL THEN RETURN NULL; END IF;
    SELECT s.slug, s.name, s.level, st.description INTO v_status
    FROM public._actor_status(v_uid) s
    JOIN public.user_statuses st ON st.id = s.status_id;

    RETURN jsonb_build_object(
        'slug', COALESCE(v_status.slug, 'usuario'),
        'name', COALESCE(v_status.name, 'Usuário'),
        'level', COALESCE(v_status.level, 0),
        'description', v_status.description,
        'permissions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('slug', e.permission, 'name', p.name, 'scope', e.scope) ORDER BY p.name)
            FROM public.get_effective_permissions(v_uid) e
            JOIN public.permissions p ON p.slug = e.permission
        ), '[]'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_grantable_plans()
RETURNS TABLE(id uuid, code text, name text, description text, price numeric, permission_used text, scope text)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT * FROM public.get_grantable_plans(auth.uid());
$$;

-- Busca de pessoas dentro do escopo (o mais amplo entre as permissões de
-- concessão). A validação final por plano é refeita em grant_plan_internal.
CREATE OR REPLACE FUNCTION public.find_grant_targets(p_query text)
RETURNS TABLE(id uuid, name text, profile_slug text, avatar_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_scope text;
    v_q text := btrim(COALESCE(p_query, ''));
BEGIN
    IF v_uid IS NULL OR length(v_q) < 2 THEN RETURN; END IF;

    SELECT e.scope INTO v_scope
    FROM public.get_effective_permissions(v_uid) e
    WHERE e.permission LIKE 'grant\_%'
    ORDER BY public._scope_rank(e.scope) DESC
    LIMIT 1;
    IF v_scope IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT p.id, p.name, p."profileSlug", p.avatar_url
    FROM public.profiles p
    WHERE p.id <> v_uid
      AND (p.name ILIKE '%' || v_q || '%' OR p."profileSlug" ILIKE '%' || v_q || '%')
      AND public.is_in_scope(v_uid, p.id, v_scope)
    ORDER BY p.name
    LIMIT 10;
END;
$$;

-- Histórico visível ao ator: o que ele mesmo fez + o que está no escopo
-- dele (rede/tudo). Administrador (escopo all) vê tudo.
CREATE OR REPLACE FUNCTION public.get_benefit_history(p_limit integer DEFAULT 100, p_only_granted boolean DEFAULT true)
RETURNS TABLE(
    id uuid, target_user_id uuid, target_name text, target_slug text,
    actor_user_id uuid, actor_name text, plan_code text, plan_name text,
    outcome text, denial_reason text, reason text,
    starts_at timestamptz, expires_at timestamptz, created_at timestamptz, is_active boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_scope text;
BEGIN
    IF v_uid IS NULL THEN RETURN; END IF;

    SELECT e.scope INTO v_scope
    FROM public.get_effective_permissions(v_uid) e
    WHERE e.permission LIKE 'grant\_%'
    ORDER BY public._scope_rank(e.scope) DESC
    LIMIT 1;

    RETURN QUERY
    SELECT l.id, l.target_user_id, t.name, t."profileSlug",
           l.actor_user_id, a.name, l.plan_code, pl.name,
           l.outcome, l.denial_reason, l.reason,
           l.starts_at, l.expires_at, l.created_at,
           COALESCE(l.outcome = 'granted' AND l.expires_at > now(), false)
    FROM public.grant_audit_logs l
    LEFT JOIN public.profiles t ON t.id = l.target_user_id
    LEFT JOIN public.profiles a ON a.id = l.actor_user_id
    LEFT JOIN public.plans pl ON pl.id = l.plan_id
    WHERE l.action = 'grant_plan'
      AND (NOT p_only_granted OR l.outcome = 'granted')
      AND (
          l.actor_user_id = v_uid
          OR v_scope = 'all'
          OR (v_scope = 'network' AND public.is_in_scope(v_uid, l.target_user_id, 'network'))
      )
    ORDER BY l.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$$;

-- ============================================================
-- 13. PERMISSÕES DE EXECUÇÃO
-- ============================================================
-- Funções que aceitam um usuário arbitrário: só service role (rotas do
-- servidor). Assim o cliente não sonda permissões alheias nem concede
-- chamando a função direto.
REVOKE ALL ON FUNCTION public._scope_rank(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._actor_status(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_effective_permissions(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_permission_scope(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_in_scope(uuid, uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_act_on_user(uuid, uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_grant_authority(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_grant_plan(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_grantable_plans(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._log_grant_event(text, text, text, uuid, uuid, uuid, text, text, text, uuid, timestamptz, timestamptz, text, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_plan_internal(uuid, uuid, uuid, integer, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_user_status_internal(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._scope_rank(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._actor_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_permission_scope(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_in_scope(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_act_on_user(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_grant_authority(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_grant_plan(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_grantable_plans(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_plan_internal(uuid, uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_status_internal(uuid, uuid, text) TO service_role;

-- Funções do cliente (sempre auth.uid()).
REVOKE ALL ON FUNCTION public.get_my_status() FROM public, anon;
REVOKE ALL ON FUNCTION public.get_my_grantable_plans() FROM public, anon;
REVOKE ALL ON FUNCTION public.find_grant_targets(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_benefit_history(integer, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_grantable_plans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_grant_targets(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_benefit_history(integer, boolean) TO authenticated;

-- ============================================================
-- 14. SUBSTITUI O "LÍDER MOTORISTA"
-- ============================================================
-- Toda a lógica agora vive em grant_plan_internal + permissões. As duas
-- funções antigas (específicas de motorista) deixam de existir.
DROP FUNCTION IF EXISTS public.grant_driver_plan_as_leader(text, text, integer);
DROP FUNCTION IF EXISTS public.get_driver_leader_downline();
