-- Cada serviço escolhe como as pessoas falam com quem oferece: o WhatsApp do perfil (show_whatsapp, que já existia e
-- vale true por padrão) e/ou o botão de conversa do iUser (show_chat, desligado por padrão).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS show_chat boolean NOT NULL DEFAULT false;
