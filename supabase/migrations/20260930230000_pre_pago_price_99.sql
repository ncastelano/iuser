-- Ajusta o preço de lançamento do Pré-pago de R$160 pra R$99.
-- Sem assinante nenhum ainda nesse plano, então não precisa propagar valor
-- pra nenhuma assinatura Asaas existente.
UPDATE public.plans SET price = 99.00 WHERE code = 'pre_pago';
