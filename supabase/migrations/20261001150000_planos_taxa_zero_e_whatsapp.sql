-- "Libera motorista, prestador e loja" virou redundante desde que todo
-- cadastro já entra automático no Pós-pago (migration
-- recrutador_universal_e_ciclo_30_dias) — ninguém mais precisa "desbloquear"
-- nada. Troca pela framing real que diferencia os planos: taxa 0% sobre
-- venda/corrida/serviço nos dois, e deixa a linha do bot de WhatsApp
-- idêntica nos dois cards (mesma feature, não é diferencial de um só).

UPDATE public.plans SET
    description = 'Sem mensalidade — cada corrida, venda, produto ou publicação que você faz custa R$0,50. Taxa 0% motorista, loja, prestador de serviço. Ao acumular R$50 em pendências, novas ações ficam bloqueadas até você quitar via Pix.',
    features = ARRAY[
        'Sem mensalidade — paga só quando usa',
        'R$0,50 por corrida, venda, produto novo, publicação, ativação de agenda ou agendamento confirmado',
        'Loja tem atendimento automático por WhatsApp (catálogo, pedido e status sozinho)',
        'Mensagens de WhatsApp fora da janela grátis de 24h são cobradas à parte, com uma pequena margem',
        'Dívida chegou a R$50? Paga via Pix pra continuar usando'
    ]
WHERE code = 'pos_pago';

UPDATE public.plans SET
    description = 'Mensalidade única de R$99, cobrada a cada 30 dias — Taxa 0% motorista, loja, prestador de serviço.',
    features = ARRAY[
        'Sem cobrança por serviço — corrida, venda, publicação, tudo incluso',
        'Loja tem atendimento automático por WhatsApp (catálogo, pedido e status sozinho)',
        'Mensagens de WhatsApp fora da janela grátis de 24h são cobradas à parte, com uma pequena margem',
        'Renovação automática a cada 30 dias'
    ]
WHERE code = 'pre_pago';
