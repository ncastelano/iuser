-- Deixa a descrição dos dois planos ativos (pré-pago/pós-pago) mais
-- completa e precisa: hoje "R$0,50 por serviço" esconde que publicar
-- produto, ativar agenda e confirmar agendamento também cobram; o limite
-- de dívida de R$50 só aparece depois que a pessoa já está bloqueada; e
-- não fica claro que o pós-pago não libera recrutador. Aproveita também
-- pra citar o atendimento automático por WhatsApp (loja), que nenhum dos
-- dois planos menciona.

UPDATE public.plans SET
    description = 'Sem mensalidade — cada corrida, venda, produto ou publicação que você faz custa R$0,50. Libera motorista, prestador e loja (recrutador fica de fora). Ao acumular R$50 em pendências, novas ações ficam bloqueadas até você quitar via Pix.',
    features = ARRAY[
        'Sem mensalidade — paga só quando usa',
        'R$0,50 por corrida, venda, produto novo, publicação, ativação de agenda ou agendamento confirmado',
        'Libera motorista, prestador e loja (recrutador não incluso)',
        'Loja também tem atendimento automático por WhatsApp',
        'Dívida chegou a R$50? Paga via Pix pra continuar usando'
    ]
WHERE code = 'pos_pago';

UPDATE public.plans SET
    description = 'Mensalidade única de R$99 — sem cobrar por corrida, venda, publicação ou qualquer serviço que você oferecer. Libera motorista, prestador, loja e recrutador, tudo junto.',
    features = ARRAY[
        'Sem cobrança por serviço — corrida, venda, publicação, tudo incluso',
        'Libera motorista, prestador, loja e recrutador — os 4 juntos',
        'Loja com atendimento automático por WhatsApp (catálogo, pedido e status sozinho)',
        'Renovação mensal automática'
    ]
WHERE code = 'pre_pago';
