-- Novo plano "recrutador": mesmo valor dos planos individuais, dá direito
-- a ganhar comissão pela venda de planos (regras de quem/quanto ainda vêm
-- depois — aqui só existe o "direito" ligado/desligado, get_active_plan_grants
-- já expõe has_recruiter pra quando essa regra for escrita).
-- Também entra no Combo, que passa a ser motorista+prestador+loja+recrutador.
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_code_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_code_check
    CHECK (code IN ('motorista', 'prestador', 'loja', 'recrutador', 'combo'));

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS grants_recruiter BOOLEAN NOT NULL DEFAULT false;

INSERT INTO public.plans (code, name, price, grants_driver, grants_provider, grants_store, grants_recruiter, is_active, description)
VALUES (
    'recrutador',
    'Recrutador',
    50.00,
    false, false, false, true,
    true,
    'Libera o modo recrutador: ganhe comissão pela venda de planos que você indicar.'
)
ON CONFLICT (code) DO NOTHING;

UPDATE public.plans
SET grants_recruiter = true,
    name = 'Combo (loja + motorista + prestador + recrutador)',
    description = 'Libera motorista + prestador + loja + recrutador, tudo junto.',
    price = 160.00
WHERE code = 'combo';

-- get_active_plan_grants ganha uma 5a coluna (has_recruiter) — precisa
-- recriar (não só substituir) porque o tipo de retorno muda de forma.
DROP FUNCTION IF EXISTS public.get_active_plan_grants(uuid);

CREATE FUNCTION public.get_active_plan_grants(p_user_id uuid)
RETURNS TABLE(has_driver boolean, has_provider boolean, has_store boolean, has_recruiter boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
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
        AND s.current_period_end > now();
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_plan_grants(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_active_plan_grants(uuid) TO authenticated;

-- store_has_active_subscription só lê a coluna has_store por nome — segue
-- funcionando sem mudança, mesmo com a 4a coluna nova.
