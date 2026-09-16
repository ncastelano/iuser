-- Reajuste de preço pedido pelo dono: 10x o valor anterior em todos os
-- planos (motorista/prestador/loja R$5 -> R$50, combo R$12 -> R$120).
-- Segue bem acima do mínimo de cobrança PIX da Asaas (R$5,00), então não
-- reabre o problema resolvido em 20260921090000.
UPDATE public.plans SET price = 50.00 WHERE code IN ('motorista', 'prestador', 'loja');
UPDATE public.plans SET price = 120.00 WHERE code = 'combo';
