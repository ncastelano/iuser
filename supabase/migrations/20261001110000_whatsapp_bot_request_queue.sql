-- A loja agora informa o número que quer usar já no pedido
-- (whatsapp_bot_requested_number), e o admin ganha um status pra
-- acompanhar a fila em vez de só "pediu" / "conectado" — dá pra marcar
-- "na fila" ou "conectando" enquanto o número de verdade ainda não saiu
-- da Meta.

ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS whatsapp_bot_requested_number TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_bot_status TEXT NOT NULL DEFAULT 'none'
        CHECK (whatsapp_bot_status IN ('none', 'requested', 'queued', 'connecting', 'connected'));

-- Backfill: lojas que já pediram ou já estão conectadas não devem voltar
-- pro estado inicial "none".
UPDATE public.stores SET whatsapp_bot_status = 'connected'
    WHERE whatsapp_bot_phone_number_id IS NOT NULL AND whatsapp_bot_status = 'none';
UPDATE public.stores SET whatsapp_bot_status = 'requested'
    WHERE whatsapp_bot_opt_in = true AND whatsapp_bot_phone_number_id IS NULL AND whatsapp_bot_status = 'none';
