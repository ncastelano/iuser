-- Fecha as pendências da arquitetura de hierarquia:
--   1. concessão com data de início futura (agendada)
--   2. administração de status/permissões/planos concedíveis/exceções, com
--      permissão própria (manage_hierarchy) e auditoria
--   3. remoção das colunas legadas do Líder Motorista

-- ============================================================
-- 1. AGENDAMENTO: o benefício só vale a partir de starts_at
-- ============================================================
-- CREATE OR REPLACE (mesma assinatura): há policies RLS que dependem dela.
CREATE OR REPLACE FUNCTION public.get_active_plan_grants(p_user_id uuid)
RETURNS TABLE(has_driver boolean, has_provider boolean, has_store boolean, has_recruiter boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
    v_email text;
BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    IF v_email = 'ncastelano@gmail.com' THEN
        RETURN QUERY SELECT true, true, true, true;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(bool_or(p.grants_driver), false),
        COALESCE(bool_or(p.grants_provider), false),
        COALESCE(bool_or(p.grants_store), false),
        COALESCE(bool_or(p.grants_recruiter), false)
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.user_id = p_user_id
        AND s.status = 'active'
        AND (s.starts_at IS NULL OR s.starts_at <= now())
        AND s.current_period_end > now();
END;
$$;
REVOKE ALL ON FUNCTION public.get_active_plan_grants(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_active_plan_grants(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_postpaid_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions s
        JOIN public.plans p ON p.id = s.plan_id
        WHERE s.user_id = p_user_id AND p.code = 'pos_pago'
          AND s.status = 'active'
          AND (s.starts_at IS NULL OR s.starts_at <= now())
          AND s.current_period_end > now()
    );
$$;

-- grant_plan_internal ganha p_starts_at (assinatura nova → recria).
DROP FUNCTION IF EXISTS public.grant_plan_internal(uuid, uuid, uuid, integer, text);
CREATE OR REPLACE FUNCTION public.grant_plan_internal(
    p_actor uuid, p_target uuid, p_plan_id uuid, p_days integer,
    p_reason text DEFAULT NULL, p_starts_at timestamptz DEFAULT NULL
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
    v_start timestamptz;
    v_end timestamptz;
    v_source text;
    v_count integer;
    v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_deny_code text;
    v_deny_msg text;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'unauthenticated', 'message', 'Não autenticado');
    END IF;

    SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;
    -- Início no passado (tolerância de 5 min) vira "agora".
    v_start := CASE WHEN p_starts_at IS NULL OR p_starts_at <= v_now + interval '5 minutes' THEN v_now ELSE p_starts_at END;

    <<checks>>
    BEGIN
        IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN
            v_deny_code := 'invalid_duration'; v_deny_msg := 'Duração inválida'; EXIT checks;
        END IF;
        IF v_start > v_now + interval '366 days' THEN
            v_deny_code := 'invalid_start'; v_deny_msg := 'A data de início pode ser no máximo daqui a 1 ano'; EXIT checks;
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

        IF v_existing.id IS NOT NULL AND v_existing.source = 'asaas' AND v_existing.status = 'active'
           AND v_existing.current_period_end > v_now THEN
            v_deny_code := 'already_subscribed'; v_deny_msg := 'Essa pessoa já tem esse plano pago ativo'; EXIT checks;
        END IF;

        -- Agendar por cima de um benefício em vigor apagaria o que ela tem
        -- hoje: só dá pra agendar quando não há concessão ativa desse plano.
        IF v_start > v_now AND v_existing.id IS NOT NULL AND v_existing.status = 'active'
           AND v_existing.current_period_end > v_now THEN
            v_deny_code := 'already_active'; v_deny_msg := 'Essa pessoa já tem esse plano ativo — conceda sem data de início para estender'; EXIT checks;
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
    v_end := v_start + make_interval(days => p_days);

    BEGIN
        IF v_existing.id IS NOT NULL THEN
            UPDATE public.subscriptions
            SET status = 'active', source = v_source, current_period_end = v_end,
                starts_at = v_start, granted_by = p_actor, granted_reason = v_reason, updated_at = v_now
            WHERE id = v_existing.id
            RETURNING * INTO v_sub;
        ELSE
            INSERT INTO public.subscriptions (user_id, plan_id, status, source, current_period_end, starts_at, granted_by, granted_reason)
            VALUES (p_target, p_plan_id, 'active', v_source, v_end, v_start, p_actor, v_reason)
            RETURNING * INTO v_sub;
        END IF;
    EXCEPTION WHEN unique_violation THEN
        PERFORM public._log_grant_event('grant_plan', 'denied', 'conflict', p_actor, p_target, v_plan.id, v_plan.code,
                                        v_perm, v_scope, NULL, NULL, NULL, v_reason, '{}'::jsonb);
        RETURN jsonb_build_object('ok', false, 'code', 'conflict', 'message', 'Conflito ao conceder, tente de novo');
    END;

    PERFORM public._log_grant_event('grant_plan', 'granted', NULL, p_actor, p_target, v_plan.id, v_plan.code,
                                    v_perm, v_scope, v_sub.id, v_start, v_end, v_reason,
                                    jsonb_build_object('days', p_days, 'source', v_source, 'scheduled', v_start > v_now));

    RETURN jsonb_build_object('ok', true, 'subscription_id', v_sub.id, 'starts_at', v_start, 'expires_at', v_end);
END;
$$;
REVOKE ALL ON FUNCTION public.grant_plan_internal(uuid, uuid, uuid, integer, text, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_plan_internal(uuid, uuid, uuid, integer, text, timestamptz) TO service_role;

-- Histórico: agora distingue "agendado".
DROP FUNCTION IF EXISTS public.get_benefit_history(integer, boolean);
CREATE FUNCTION public.get_benefit_history(p_limit integer DEFAULT 100, p_only_granted boolean DEFAULT true)
RETURNS TABLE(
    id uuid, target_user_id uuid, target_name text, target_slug text,
    actor_user_id uuid, actor_name text, plan_code text, plan_name text,
    outcome text, denial_reason text, reason text,
    starts_at timestamptz, expires_at timestamptz, created_at timestamptz,
    is_active boolean, is_scheduled boolean
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
           COALESCE(l.outcome = 'granted' AND l.starts_at <= now() AND l.expires_at > now(), false),
           COALESCE(l.outcome = 'granted' AND l.starts_at > now(), false)
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
REVOKE ALL ON FUNCTION public.get_benefit_history(integer, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_benefit_history(integer, boolean) TO authenticated;

-- ============================================================
-- 2. ADMINISTRAÇÃO DA HIERARQUIA (permissão própria + auditoria)
-- ============================================================
INSERT INTO public.permissions (slug, name, description) VALUES
    ('manage_hierarchy', 'Gerenciar hierarquia', 'Criar/editar status, permissões por status, planos concedíveis e exceções por pessoa.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.status_permissions (status_id, permission_id, scope)
SELECT s.id, p.id, 'all'
FROM public.user_statuses s, public.permissions p
WHERE s.slug = 'administrador' AND p.slug = 'manage_hierarchy'
ON CONFLICT (status_id, permission_id) DO NOTHING;

ALTER TABLE public.grant_audit_logs DROP CONSTRAINT IF EXISTS grant_audit_logs_action_check;
ALTER TABLE public.grant_audit_logs ADD CONSTRAINT grant_audit_logs_action_check
    CHECK (action IN ('grant_plan', 'set_status', 'hierarchy_change'));

CREATE OR REPLACE FUNCTION public.manage_hierarchy_internal(p_actor uuid, p_action text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_status public.user_statuses;
    v_perm public.permissions;
    v_target uuid;
    v_slug text;
    v_level integer;
    v_scope text;
    v_deny_code text;
    v_deny_msg text;
    -- permissões sem as quais o Administrador perderia o controle do sistema
    c_admin_required text[] := ARRAY['grant_any_plan', 'manage_leaders', 'manage_hierarchy'];
BEGIN
    IF NOT public.has_permission(p_actor, 'manage_hierarchy') THEN
        v_deny_code := 'permission_denied'; v_deny_msg := 'Você não pode gerenciar a hierarquia';
    END IF;

    IF v_deny_code IS NULL THEN
        <<work>>
        BEGIN
            IF p_action = 'upsert_status' THEN
                v_slug := lower(btrim(COALESCE(p_payload->>'slug', '')));
                v_level := (p_payload->>'level')::integer;
                IF v_slug !~ '^[a-z0-9_]{2,40}$' OR btrim(COALESCE(p_payload->>'name', '')) = '' OR v_level IS NULL OR v_level < 0 OR v_level > 100 THEN
                    v_deny_code := 'invalid_payload'; v_deny_msg := 'Dados do status inválidos'; EXIT work;
                END IF;
                IF v_slug = 'usuario' AND (v_level <> 0 OR COALESCE((p_payload->>'is_active')::boolean, true) = false) THEN
                    v_deny_code := 'protected_status'; v_deny_msg := 'O status Usuário é fixo (nível 0, sempre ativo)'; EXIT work;
                END IF;
                IF v_slug = 'administrador' AND COALESCE((p_payload->>'is_active')::boolean, true) = false THEN
                    v_deny_code := 'protected_status'; v_deny_msg := 'O status Administrador não pode ser desativado'; EXIT work;
                END IF;
                IF v_slug <> 'usuario' AND v_level = 0 THEN
                    v_deny_code := 'invalid_payload'; v_deny_msg := 'O nível 0 é reservado ao status Usuário'; EXIT work;
                END IF;
                INSERT INTO public.user_statuses (slug, name, level, description, is_active)
                VALUES (v_slug, btrim(p_payload->>'name'), v_level, NULLIF(btrim(COALESCE(p_payload->>'description', '')), ''),
                        COALESCE((p_payload->>'is_active')::boolean, true))
                ON CONFLICT (slug) DO UPDATE
                SET name = EXCLUDED.name, level = EXCLUDED.level, description = EXCLUDED.description,
                    is_active = EXCLUDED.is_active, updated_at = now();

            ELSIF p_action = 'set_status_permission' THEN
                SELECT * INTO v_status FROM public.user_statuses WHERE slug = p_payload->>'status_slug';
                SELECT * INTO v_perm FROM public.permissions WHERE slug = p_payload->>'permission_slug';
                v_scope := p_payload->>'scope';
                IF v_status.id IS NULL OR v_perm.id IS NULL OR v_scope NOT IN ('direct_invite', 'direct_downline', 'network', 'all') THEN
                    v_deny_code := 'invalid_payload'; v_deny_msg := 'Status, permissão ou escopo inválido'; EXIT work;
                END IF;
                IF v_status.slug = 'administrador' AND v_perm.slug = ANY (c_admin_required) AND v_scope <> 'all' THEN
                    v_deny_code := 'protected_status'; v_deny_msg := 'Essa permissão do Administrador precisa ter escopo total'; EXIT work;
                END IF;
                INSERT INTO public.status_permissions (status_id, permission_id, scope)
                VALUES (v_status.id, v_perm.id, v_scope)
                ON CONFLICT (status_id, permission_id) DO UPDATE SET scope = EXCLUDED.scope;

            ELSIF p_action = 'remove_status_permission' THEN
                SELECT * INTO v_status FROM public.user_statuses WHERE slug = p_payload->>'status_slug';
                SELECT * INTO v_perm FROM public.permissions WHERE slug = p_payload->>'permission_slug';
                IF v_status.id IS NULL OR v_perm.id IS NULL THEN
                    v_deny_code := 'invalid_payload'; v_deny_msg := 'Status ou permissão inválido'; EXIT work;
                END IF;
                IF v_status.slug = 'administrador' AND v_perm.slug = ANY (c_admin_required) THEN
                    v_deny_code := 'protected_status'; v_deny_msg := 'O Administrador não pode perder essa permissão'; EXIT work;
                END IF;
                DELETE FROM public.status_permissions WHERE status_id = v_status.id AND permission_id = v_perm.id;

            ELSIF p_action = 'set_plan_grant_settings' THEN
                IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = (p_payload->>'plan_id')::uuid) THEN
                    v_deny_code := 'invalid_payload'; v_deny_msg := 'Plano não encontrado'; EXIT work;
                END IF;
                v_slug := NULLIF(p_payload->>'grant_permission', '');
                IF v_slug IS NOT NULL AND (v_slug NOT LIKE 'grant\_%' OR v_slug = 'grant_any_plan'
                        OR NOT EXISTS (SELECT 1 FROM public.permissions WHERE slug = v_slug)) THEN
                    v_deny_code := 'invalid_payload'; v_deny_msg := 'Permissão de concessão inválida'; EXIT work;
                END IF;
                UPDATE public.plans
                SET grantable = COALESCE((p_payload->>'grantable')::boolean, grantable), grant_permission = v_slug
                WHERE id = (p_payload->>'plan_id')::uuid;

            ELSIF p_action = 'set_user_permission' THEN
                v_target := (p_payload->>'profile_id')::uuid;
                SELECT * INTO v_perm FROM public.permissions WHERE slug = p_payload->>'permission_slug';
                v_scope := NULLIF(p_payload->>'scope', '');
                IF v_target IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_target) OR v_perm.id IS NULL
                   OR p_payload->>'effect' NOT IN ('grant', 'revoke')
                   OR (p_payload->>'effect' = 'grant' AND (v_scope IS NULL OR v_scope NOT IN ('direct_invite', 'direct_downline', 'network', 'all'))) THEN
                    v_deny_code := 'invalid_payload'; v_deny_msg := 'Pessoa, permissão, efeito ou escopo inválido'; EXIT work;
                END IF;
                IF v_target = p_actor AND p_payload->>'effect' = 'revoke' THEN
                    v_deny_code := 'self_change_denied'; v_deny_msg := 'Você não pode revogar as próprias permissões'; EXIT work;
                END IF;
                INSERT INTO public.user_permissions (profile_id, permission_id, effect, scope, expires_at, granted_by, reason)
                VALUES (v_target, v_perm.id, p_payload->>'effect', CASE WHEN p_payload->>'effect' = 'grant' THEN v_scope END,
                        NULLIF(p_payload->>'expires_at', '')::timestamptz, p_actor, NULLIF(btrim(COALESCE(p_payload->>'reason', '')), ''))
                ON CONFLICT (profile_id, permission_id) DO UPDATE
                SET effect = EXCLUDED.effect, scope = EXCLUDED.scope, expires_at = EXCLUDED.expires_at,
                    granted_by = EXCLUDED.granted_by, reason = EXCLUDED.reason, created_at = now();

            ELSIF p_action = 'remove_user_permission' THEN
                v_target := (p_payload->>'profile_id')::uuid;
                SELECT * INTO v_perm FROM public.permissions WHERE slug = p_payload->>'permission_slug';
                IF v_target IS NULL OR v_perm.id IS NULL THEN
                    v_deny_code := 'invalid_payload'; v_deny_msg := 'Pessoa ou permissão inválida'; EXIT work;
                END IF;
                DELETE FROM public.user_permissions WHERE profile_id = v_target AND permission_id = v_perm.id;

            ELSE
                v_deny_code := 'unknown_action'; v_deny_msg := 'Ação desconhecida';
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_deny_code := 'invalid_payload'; v_deny_msg := 'Dados inválidos';
        END;
    END IF;

    IF v_deny_code IS NOT NULL THEN
        PERFORM public._log_grant_event('hierarchy_change', 'denied', v_deny_code, p_actor, NULL, NULL, NULL,
                                        'manage_hierarchy', NULL, NULL, NULL, NULL, NULL,
                                        jsonb_build_object('action', p_action, 'payload', p_payload));
        RETURN jsonb_build_object('ok', false, 'code', v_deny_code, 'message', v_deny_msg);
    END IF;

    PERFORM public._log_grant_event('hierarchy_change', 'granted', NULL, p_actor, NULL, NULL, NULL,
                                    'manage_hierarchy', 'all', NULL, NULL, NULL, NULL,
                                    jsonb_build_object('action', p_action, 'payload', p_payload));
    RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.manage_hierarchy_internal(uuid, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_hierarchy_internal(uuid, text, jsonb) TO service_role;

-- ============================================================
-- 3. LEGADO DO LÍDER MOTORISTA
-- ============================================================
-- Nada mais lê essas colunas (a migração de status já foi feita e conferida).
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_lider_motorista;
ALTER TABLE public.plans DROP COLUMN IF EXISTS leader_grantable;
