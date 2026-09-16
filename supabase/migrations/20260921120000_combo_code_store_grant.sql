-- redeem_plan_code também precisa da mesma ponte pro paywall antigo de
-- criação de loja que o webhook da Asaas e a concessão do admin já fazem
-- (20260915130000 / 20260921120000-admin route) — sem isso, resgatar um
-- código de Combo libera "manter a loja aberta pra vender"
-- (get_active_plan_grants) mas não "criar uma loja pela primeira vez"
-- (store_access_grants, consumido por create_store_with_access).
CREATE OR REPLACE FUNCTION public.redeem_plan_code(p_code text)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code public.plan_codes;
    v_plan public.plans;
    v_period_end timestamptz;
    v_existing_id uuid;
    v_sub public.subscriptions;
    v_existing_grant_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Não autenticado';
    END IF;

    SELECT * INTO v_code
    FROM public.plan_codes
    WHERE code = p_code AND active = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Código inválido ou já usado';
    END IF;

    IF v_code.use_count >= v_code.max_uses THEN
        RAISE EXCEPTION 'Código esgotado';
    END IF;

    SELECT * INTO v_plan FROM public.plans WHERE id = v_code.plan_id;

    v_period_end := CASE
        WHEN v_code.grant_type = 'days' THEN now() + make_interval(days => v_code.days)
        ELSE now() + interval '100 years' -- "vitalício" representado como validade bem longa, mesma ideia de current_period_end sempre existir
    END;

    SELECT id INTO v_existing_id
    FROM public.subscriptions
    WHERE user_id = auth.uid() AND plan_id = v_code.plan_id AND status IN ('pending', 'active')
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
        UPDATE public.subscriptions
        SET status = 'active', source = 'code', current_period_end = v_period_end, updated_at = now()
        WHERE id = v_existing_id
        RETURNING * INTO v_sub;
    ELSE
        INSERT INTO public.subscriptions (user_id, plan_id, status, source, current_period_end)
        VALUES (auth.uid(), v_code.plan_id, 'active', 'code', v_period_end)
        RETURNING * INTO v_sub;
    END IF;

    UPDATE public.plan_codes
        SET use_count = use_count + 1,
            active = CASE WHEN use_count + 1 >= max_uses THEN false ELSE active END
        WHERE id = v_code.id;

    IF v_plan.code = 'combo' THEN
        SELECT id INTO v_existing_grant_id
        FROM public.store_access_grants
        WHERE profile_id = auth.uid() AND status = 'approved' AND store_id IS NULL
        LIMIT 1;

        IF v_existing_grant_id IS NULL THEN
            INSERT INTO public.store_access_grants (profile_id, source, grant_type, status, reviewed_at)
            VALUES (auth.uid(), 'combo_subscription', 'lifetime', 'approved', now());
        END IF;
    END IF;

    RETURN v_sub;
END;
$$;
