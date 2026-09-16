-- Remove o paywall antigo de criação de loja (taxa única via PIX manual
-- aprovado pelo admin, ou código de liberação avulso): "a função dos
-- planos é pra isso" — criar loja passa a exigir a mesma assinatura ativa
-- (Loja ou Combo) que já trava "manter a loja aberta pra vender" em
-- Store.tsx/get_active_plan_grants. Não apaga store_access_grants/
-- store_access_codes/store_access_settings (histórico de pagamentos e
-- códigos já emitidos continua consultável), só para de exigir uma linha
-- ali pra criar loja nova.
DROP FUNCTION IF EXISTS public.create_store_with_access(uuid, jsonb);

CREATE FUNCTION public.create_store_with_access(p_store jsonb)
RETURNS public.stores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_store boolean;
    v_store public.stores;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Não autenticado';
    END IF;

    SELECT has_store INTO v_has_store FROM public.get_active_plan_grants(auth.uid());

    IF NOT v_has_store THEN
        RAISE EXCEPTION 'Assine o plano Loja ou Combo pra criar sua loja.';
    END IF;

    INSERT INTO public.stores (
        name, "storeSlug", description, logo_url, owner_id,
        location, address, store_lat, store_lng,
        address_number, address_complement, category, whatsapp,
        access_granted_at
    ) VALUES (
        p_store->>'name',
        p_store->>'storeSlug',
        p_store->>'description',
        p_store->>'logo_url',
        auth.uid(),
        CASE WHEN p_store->>'store_lat' IS NOT NULL AND p_store->>'store_lng' IS NOT NULL
            THEN ('POINT(' || (p_store->>'store_lng') || ' ' || (p_store->>'store_lat') || ')')::geography
            ELSE NULL END,
        p_store->>'address',
        NULLIF(p_store->>'store_lat', '')::double precision,
        NULLIF(p_store->>'store_lng', '')::double precision,
        p_store->>'address_number',
        p_store->>'address_complement',
        p_store->>'category',
        p_store->>'whatsapp',
        now()
    ) RETURNING * INTO v_store;

    RETURN v_store;
END;
$$;

REVOKE ALL ON FUNCTION public.create_store_with_access(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_store_with_access(jsonb) TO authenticated;

-- redeem_plan_code não precisa mais ponte pra store_access_grants — o
-- Combo já concede has_store direto via plans.grants_store, sem precisar
-- de uma linha bridge no sistema antigo.
CREATE OR REPLACE FUNCTION public.redeem_plan_code(p_code text)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code public.plan_codes;
    v_period_end timestamptz;
    v_existing_id uuid;
    v_sub public.subscriptions;
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

    v_period_end := CASE
        WHEN v_code.grant_type = 'days' THEN now() + make_interval(days => v_code.days)
        ELSE now() + interval '100 years'
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

    RETURN v_sub;
END;
$$;
