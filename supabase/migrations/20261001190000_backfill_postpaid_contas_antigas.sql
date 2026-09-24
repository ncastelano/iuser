-- Quem se cadastrou ANTES do cadastro passar a ativar o Pós-pago sozinho
-- (LoginAndRegister/cadastrar/criar-loja-com-cadastro) nunca ganhou
-- nenhuma assinatura — fica bloqueado de vender/dirigir/prestar serviço
-- até assinar manualmente em /planos ("Loja fechada — assinatura
-- pendente" mesmo com a loja aberta). Dá a mesma ativação automática pra
-- essas contas antigas.
--
-- Sem CPF/aparelho aqui (diferente do fluxo de cadastro novo): a trava
-- anti-fraude existe pra impedir conta NOVA só pra abusar do grátis —
-- contas que já existiam antes dessa mudança não têm esse risco.
INSERT INTO public.subscriptions (user_id, plan_id, status, source, current_period_end)
SELECT p.id, pl.id, 'active', 'postpaid', '2099-12-31T00:00:00.000Z'::timestamptz
FROM public.profiles p
CROSS JOIN (SELECT id FROM public.plans WHERE code = 'pos_pago' LIMIT 1) pl
WHERE NOT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = p.id AND s.status IN ('pending', 'active')
);
