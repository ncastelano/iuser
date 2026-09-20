-- Remarcar uma concessão agendada que ainda não começou é permitido: só
-- é negado agendar por cima de um benefício que já está em vigor.
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

        -- Agendar por cima de um benefício EM VIGOR apagaria o que ela tem
        -- hoje. Um agendamento que ainda não começou pode ser remarcado.
        IF v_start > v_now AND v_existing.id IS NOT NULL AND v_existing.status = 'active'
           AND (v_existing.starts_at IS NULL OR v_existing.starts_at <= v_now)
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
