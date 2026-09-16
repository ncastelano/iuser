-- Reajuste do plano Beta pra R$20/semana (era R$5) — valor mais próximo do
-- real (R$50-160/mês nos outros planos), pra quem assinar a partir de
-- agora já ver o valor certo. O reajuste em si e a propagação pra quem já
-- era assinante (via updateSubscriptionValue na Asaas) já foram feitos
-- direto pela rota /api/admin/plans/update-price — esta migration só
-- alinha o schema com o que já está valendo em produção.
UPDATE public.plans
SET price = 20.00,
    features = ARRAY[
        'Libera motorista + prestador + loja + recrutador, igual o Combo',
        'Renovação semanal de R$20,00',
        'Vagas limitadas — enquanto durar'
    ]
WHERE code = 'beta';
