-- O dono escolhe se o WhatsApp da loja aparece publicamente na página da loja.
-- Default true preserva o comportamento das lojas existentes.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS show_whatsapp BOOLEAN NOT NULL DEFAULT true;
