-- Ajusta o texto sobre a cobrança de mensagens do bot de WhatsApp: não é
-- "fora da janela de 24h" (isso nunca foi cobrado) — é depois que a cota
-- gratuita MENSAL da Meta pro número acabar (a partir de out/2026,
-- ver migration whatsapp_bot_message_fee), e vale nos dois planos.

UPDATE public.plans SET
    features[4] = 'Mensagens do bot além da cota gratuita mensal da Meta são cobradas à parte (custo estimado + R$0,15), mesmo no pós-pago'
WHERE code = 'pos_pago';

UPDATE public.plans SET
    features[3] = 'Mensagens do bot além da cota gratuita mensal da Meta são cobradas à parte (custo estimado + R$0,15), mesmo no pré-pago'
WHERE code = 'pre_pago';
