-- Código promocional pra plano (motorista/prestador/loja/combo) — mesmo
-- espírito de store_access_codes/redeem_store_access_code, que já existe
-- pra liberar loja, agora pro sistema de assinatura recorrente. Terceiro
-- jeito de ter um plano ativo, ao lado de (a) pagar via Asaas e (b) o admin
-- conceder direto pelo profileSlug (20260921090000).
CREATE TABLE IF NOT EXISTS public.plan_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    plan_id UUID NOT NULL REFERENCES public.plans(id),
    grant_type TEXT NOT NULL CHECK (grant_type IN ('days', 'lifetime')),
    days INTEGER,
    active BOOLEAN NOT NULL DEFAULT true,
    max_uses INTEGER NOT NULL DEFAULT 1,
    use_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT plan_codes_days_check CHECK (
        (grant_type = 'days' AND days IS NOT NULL AND days > 0)
        OR (grant_type = 'lifetime' AND days IS NULL)
    )
);

ALTER TABLE public.plan_codes ENABLE ROW LEVEL SECURITY;
-- Sem policy de select/insert pro client: só a rota /api/admin/plan-codes/*
-- (supabaseAdmin) e a função redeem_plan_code (security definer) tocam
-- essa tabela.

-- ===== redeem_plan_code =====
-- Resgata um código: cria/estende uma linha em subscriptions com
-- source='code', status='active', current_period_end conforme o
-- grant_type do código. Não fica sabendo se já existia assinatura
-- Asaas anterior — só garante que ao final existe uma linha ativa e
-- dentro da validade pra esse plano.
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

    RETURN v_sub;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_plan_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_plan_code(text) TO authenticated;

-- 'code' passa a ser uma origem válida de assinatura, ao lado de
-- 'asaas'/'admin_grant' (20260921090000).
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_source_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_source_check
    CHECK (source IN ('asaas', 'admin_grant', 'code'));
