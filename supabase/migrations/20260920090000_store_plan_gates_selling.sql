-- A loja é CRIADA pelo pagamento único já existente
-- (store_access_paywall/create_store_with_access) — isso não muda. Mas
-- ficou combinado que, além disso, ela só fica ABERTA pra vender (adicionar
-- produto, aparecer pros compradores) enquanto o dono tiver uma assinatura
-- mensal ativa (plano Loja ou Combo). Reativa o plano Loja pra venda
-- (estava is_active=false, só como referência de preço pra comissão).
UPDATE public.plans SET is_active = true WHERE code = 'loja';

-- Checagem pública de "essa loja está com a mensalidade em dia": qualquer
-- visitante da página da loja precisa saber se ela está aberta pra vender,
-- mas subscriptions só é legível pelo próprio dono (RLS). Uma função
-- SECURITY DEFINER que devolve só um boolean (nunca valor pago, nunca
-- histórico) resolve sem afrouxar a RLS da tabela real — mesmo padrão de
-- create_store_with_access/redeem_store_access_code, que já são
-- SECURITY DEFINER nesse projeto.
CREATE OR REPLACE FUNCTION public.store_has_active_subscription(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.subscriptions s
        JOIN public.plans p ON p.id = s.plan_id
        WHERE s.user_id = p_owner_id
            AND s.status = 'active'
            AND p.grants_store = true
    );
$$;

REVOKE ALL ON FUNCTION public.store_has_active_subscription(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.store_has_active_subscription(uuid) TO anon, authenticated;
