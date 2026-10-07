-- Mensagem do bot de WhatsApp além da cota gratuita da Meta: sempre cobrada À PARTE,
-- em qualquer plano (é custo de terceiro), mas com valor por plano:
--   · Pré-pago (e brinde): R$ 0,25 por mensagem, fora da mensalidade
--     (service_pricing 'whatsapp_bot_message_fee', como já era).
--   · Pós-pago: cada mensagem conta como um uso normal de R$ 0,50 no saldo
--     (service_pricing 'whatsapp_bot_message_fee_postpaid', editável no admin).

-- As listas de tipos voltam a ter TODOS os tipos (inclusive o bot de WhatsApp e o novo).
ALTER TABLE public.service_pricing DROP CONSTRAINT IF EXISTS service_pricing_service_type_check;
ALTER TABLE public.service_pricing ADD CONSTRAINT service_pricing_service_type_check
    CHECK (service_type IN (
        'ride_fee', 'service_fee', 'order_fee', 'in_person_fee',
        'product_fee', 'publication_fee', 'service_listing_fee', 'schedule_activation_fee', 'appointment_fee',
        'whatsapp_bot_message_fee', 'whatsapp_bot_message_fee_postpaid'
    ));

ALTER TABLE public.driver_postpaid_charges DROP CONSTRAINT IF EXISTS driver_postpaid_charges_type_check;
ALTER TABLE public.driver_postpaid_charges ADD CONSTRAINT driver_postpaid_charges_type_check
    CHECK (type IN ('ride_fee', 'service_fee', 'order_fee', 'in_person_fee', 'product_fee', 'publication_fee',
                    'service_listing_fee', 'schedule_activation_fee', 'appointment_fee', 'whatsapp_bot_message_fee', 'payment'));

INSERT INTO public.service_pricing (service_type, label, base_price, postpaid_price)
VALUES ('whatsapp_bot_message_fee_postpaid', 'Mensagem do bot de WhatsApp no Pós-pago (conta como 1 uso)', 0.50, 0.50)
ON CONFLICT (service_type) DO NOTHING;

-- Textos dos planos
UPDATE public.plans SET features[4] = 'Mensagens extras do WhatsApp: após a cota gratuita da Meta, cada mensagem custa R$ 0,50 e conta como um uso no saldo'
    WHERE code = 'pos_pago' AND features[4] LIKE 'Mensagens%';
UPDATE public.plans SET features[4] = 'Mensagens extras do WhatsApp: após a cota gratuita da Meta, são cobradas à parte da mensalidade (R$ 0,25 por mensagem)'
    WHERE code = 'pre_pago' AND features[4] LIKE 'Mensagens%';
