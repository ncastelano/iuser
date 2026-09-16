-- Reajusta os preços pro mínimo de cobrança recorrente da Asaas (R$5,00) —
-- confirmado testando direto na API em sandbox que R$0,50/0,80/1,00/1,50
-- nunca seriam cobráveis de verdade (erro "valor mínimo é R$5,00", mesmo
-- pedindo PIX). Combo em R$12 mantém vantagem clara sobre 5+5+5=15 separado.
UPDATE public.plans SET price = 5.00 WHERE code IN ('motorista', 'prestador', 'loja');
UPDATE public.plans SET price = 12.00 WHERE code = 'combo';

-- Descrição de cada plano (pra mostrar em /planos o que cada um libera) —
-- fica no banco, não hardcoded no front, mesmo espírito do preço
-- configurável sem precisar de deploy.
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS description TEXT;
UPDATE public.plans SET description = 'Libera o modo motorista: aceitar corridas.' WHERE code = 'motorista';
UPDATE public.plans SET description = 'Libera o modo prestador: se candidatar a pedidos de serviço.' WHERE code = 'prestador';
UPDATE public.plans SET description = 'Mantém sua loja aberta pra vender: adicionar produto e aparecer pros compradores.' WHERE code = 'loja';
UPDATE public.plans SET description = 'Libera motorista + prestador + loja, tudo junto.' WHERE code = 'combo';

-- Concessão manual de plano pelo admin, sem passar pela Asaas — mesmo
-- espírito de store_access_grants (códigos/concessão direta que já existem
-- pra loja), agora pro sistema de assinatura recorrente. Reaproveita a
-- própria tabela subscriptions: uma linha com source='admin_grant', sem
-- asaas_subscription_id, current_period_end = validade que o admin
-- escolheu. Todo o resto do sistema (gates, RPC pública da loja) não
-- precisa saber a diferença — só olha status/validade.
ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'asaas' CHECK (source IN ('asaas', 'admin_grant')),
    ADD COLUMN IF NOT EXISTS granted_by UUID REFERENCES public.profiles(id);

-- ===== get_active_plan_grants =====
-- Única fonte de verdade pra "esse usuário tem direito a motorista/
-- prestador/loja agora": lê subscriptions ativas E dentro da validade
-- (current_period_end > now() — sem isso, uma concessão do admin por
-- tempo limitado nunca expiraria sozinha), e o administrador geral sempre
-- passa direto (mesmo hardcode de create_store_with_access — os dois
-- precisam apontar pro mesmo e-mail).
CREATE OR REPLACE FUNCTION public.get_active_plan_grants(p_user_id uuid)
RETURNS TABLE(has_driver boolean, has_provider boolean, has_store boolean)
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
        RETURN QUERY SELECT true, true, true;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(bool_or(p.grants_driver), false),
        COALESCE(bool_or(p.grants_provider), false),
        COALESCE(bool_or(p.grants_store), false)
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.user_id = p_user_id
        AND s.status = 'active'
        AND s.current_period_end > now();
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_plan_grants(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_active_plan_grants(uuid) TO authenticated;

-- store_has_active_subscription (pública, usada na página da loja) passa a
-- reaproveitar a mesma lógica em vez de duplicar a query — ganha de graça o
-- bypass de admin e a checagem de validade.
CREATE OR REPLACE FUNCTION public.store_has_active_subscription(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT has_store FROM public.get_active_plan_grants(p_owner_id);
$$;

REVOKE ALL ON FUNCTION public.store_has_active_subscription(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.store_has_active_subscription(uuid) TO anon, authenticated;
