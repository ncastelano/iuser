-- Comissão de indicação (creditReferralCommission, no webhook da Asaas) já
-- credita qualquer pessoa com upline_id, sem checar plano/role — nunca
-- teve trava real, só a descrição dos planos insinuava que "recrutador"
-- era algo pra desbloquear. Tira essa framing: indicar e ganhar comissão
-- já vale pra qualquer cadastrado. Aproveita pra trocar "por mês" por "a
-- cada 30 dias", que é como a cobrança de verdade funciona (ciclo
-- rolante, não alinhado ao mês calendário).

UPDATE public.plans SET
    description = 'Sem mensalidade — cada corrida, venda, produto ou publicação que você faz custa R$0,50. Libera motorista, prestador e loja. Ao acumular R$50 em pendências, novas ações ficam bloqueadas até você quitar via Pix.',
    features = ARRAY[
        'Sem mensalidade — paga só quando usa',
        'R$0,50 por corrida, venda, produto novo, publicação, ativação de agenda ou agendamento confirmado',
        'Libera motorista, prestador e loja',
        'Loja também tem atendimento automático por WhatsApp',
        'Dívida chegou a R$50? Paga via Pix pra continuar usando'
    ]
WHERE code = 'pos_pago';

UPDATE public.plans SET
    description = 'Mensalidade única de R$99, cobrada a cada 30 dias — sem cobrar por corrida, venda, publicação ou qualquer serviço que você oferecer. Libera motorista, prestador e loja, tudo junto.',
    features = ARRAY[
        'Sem cobrança por serviço — corrida, venda, publicação, tudo incluso',
        'Libera motorista, prestador e loja — os 3 juntos',
        'Loja com atendimento automático por WhatsApp (catálogo, pedido e status sozinho)',
        'Renovação automática a cada 30 dias'
    ]
WHERE code = 'pre_pago';
