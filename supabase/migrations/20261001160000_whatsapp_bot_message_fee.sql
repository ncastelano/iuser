-- A partir de 1º de outubro de 2026 a Meta passa a cobrar por mensagem de
-- serviço (o tipo que o nosso bot manda — texto livre, sem modelo,
-- respondendo dentro da janela de 24h) depois que a cota gratuita mensal
-- do número acabar. Até aqui era sempre grátis. Como não dá pra saber o
-- valor exato cobrado pela Meta no momento (o webhook manda "billable:
-- true/false" mas não o valor em R$ — só a fatura da Meta tem isso),
-- guardamos uma estimativa editável pelo admin (base_price) e cobramos da
-- loja essa estimativa + R$0,15 de margem (postpaid_price) — o admin
-- ajusta base_price conforme a fatura real da Meta for chegando.
--
-- Diferente dos outros tipos dessa tabela: essa cobrança vale pra
-- QUALQUER loja com o bot ativo, pré-pago ou pós-pago — a mensalidade do
-- pré-pago não cobre custo de terceiro (Meta), só as taxas internas do
-- iuser.

ALTER TABLE public.service_pricing DROP CONSTRAINT IF EXISTS service_pricing_service_type_check;
ALTER TABLE public.service_pricing ADD CONSTRAINT service_pricing_service_type_check
    CHECK (service_type IN (
        'ride_fee', 'service_fee', 'order_fee', 'in_person_fee',
        'product_fee', 'publication_fee', 'schedule_activation_fee', 'appointment_fee',
        'whatsapp_bot_message_fee'
    ));

INSERT INTO public.service_pricing (service_type, label, base_price, postpaid_price)
VALUES (
    'whatsapp_bot_message_fee',
    'Mensagem cobrada pela Meta (bot de WhatsApp) — estimativa, ajuste pela fatura real',
    0.10,
    0.25
)
ON CONFLICT (service_type) DO NOTHING;

-- Ledger: mesmo padrão dos outros tipos, mas sem checar is_postpaid_user
-- (essa cobrança não é isenta pra pré-pago). Dedupe por wa_message_id —
-- a Meta pode reentregar o mesmo webhook de status mais de uma vez.
ALTER TABLE public.driver_postpaid_charges DROP CONSTRAINT IF EXISTS driver_postpaid_charges_type_check;
ALTER TABLE public.driver_postpaid_charges ADD CONSTRAINT driver_postpaid_charges_type_check
    CHECK (type IN ('ride_fee', 'service_fee', 'order_fee', 'product_fee', 'publication_fee',
                    'schedule_activation_fee', 'appointment_fee', 'whatsapp_bot_message_fee', 'payment'));

ALTER TABLE public.driver_postpaid_charges ADD COLUMN IF NOT EXISTS wa_message_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS driver_postpaid_wa_message_dedupe_idx
    ON public.driver_postpaid_charges (wa_message_id) WHERE type = 'whatsapp_bot_message_fee';
