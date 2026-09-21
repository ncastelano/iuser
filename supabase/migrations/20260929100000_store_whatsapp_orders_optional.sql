-- Receber o pedido também por WhatsApp é opcional. O pedido sempre aparece no
-- iUser; com isso ligado, o cliente é levado ao WhatsApp da loja ao finalizar.
-- Default true preserva o comportamento das lojas existentes.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS whatsapp_orders_enabled BOOLEAN NOT NULL DEFAULT true;
