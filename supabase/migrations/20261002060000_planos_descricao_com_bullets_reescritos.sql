-- Reescreve description/features dos dois planos com o texto pedido: um
-- resumo mais direto (tagline + parágrafo curto) e os bullets com a mesma
-- pontuação em todos ("Rótulo: explicação"), em vez do texto corrido e um
-- pouco solto que estava antes.

UPDATE public.plans SET
    description = 'Sem mensalidade. Use quando precisar e pague apenas pelos serviços utilizados. Ao atingir R$ 50 em saldo pendente, novos usos ficam temporariamente indisponíveis até o pagamento via Pix.',
    features = ARRAY[
        'Sem mensalidade: você paga somente quando usar',
        'R$ 0,50 por uso: corrida, venda, novo produto, publicação, ativação de agenda ou agendamento confirmado',
        'WhatsApp automático para lojas: catálogo, pedidos e atualização de status',
        'Mensagens extras do WhatsApp: após a cota gratuita da Meta, são cobradas separadamente conforme o custo da mensagem + R$ 0,15',
        'Limite de saldo pendente de R$ 50: atingido o limite, basta pagar via Pix para continuar usando'
    ]
WHERE code = 'pos_pago';

UPDATE public.plans SET
    description = 'Use sem cobrança por serviço. Tenha acesso aos recursos do iUser por um valor fixo, com 0% de taxa por corrida ou venda.',
    features = ARRAY[
        'Tudo incluso: sem cobrança por corrida, venda, novo produto, publicação, ativação de agenda ou agendamento confirmado',
        '0% de taxa: o iUser não cobra percentual sobre suas corridas ou vendas',
        'WhatsApp automático para lojas: catálogo, pedidos e atualização de status',
        'Mensagens extras do WhatsApp: após a cota gratuita da Meta, são cobradas separadamente conforme o custo da mensagem + R$ 0,15',
        'Renovação automática: seu plano é renovado a cada 30 dias'
    ]
WHERE code = 'pre_pago';
