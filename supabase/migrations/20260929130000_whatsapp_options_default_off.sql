-- Lojas novas começam com as opções de WhatsApp desmarcadas (a pessoa escolhe).
-- Só muda o padrão de agora em diante: lojas existentes mantêm o que têm.
ALTER TABLE public.stores ALTER COLUMN whatsapp_orders_enabled SET DEFAULT false;
ALTER TABLE public.stores ALTER COLUMN show_whatsapp SET DEFAULT false;
