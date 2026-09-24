-- Erro de cópia: a descrição do pós-pago dizia "Taxa 0%" logo depois de
-- explicar que cada ação custa R$0,50 — contraditório. "Taxa 0%" só é
-- verdade pro pré-pago (mensalidade fixa, sem cobrança por ação); no
-- pós-pago a taxa É R$0,50 por ação. Tira a frase errada.

UPDATE public.plans SET
    description = 'Sem mensalidade — cada corrida, venda, produto ou publicação que você faz custa R$0,50 (motorista, loja, prestador de serviço). Ao acumular R$50 em pendências, novas ações ficam bloqueadas até você quitar via Pix.'
WHERE code = 'pos_pago';
