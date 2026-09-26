-- Escolha por publicação (não por loja inteira) de mostrar ou não um botão
-- de contato via WhatsApp - quem cria a publicação decide na hora, em vez de
-- herdar sempre a configuração geral da loja (stores.show_whatsapp).
-- Default true: mantém o comportamento que já era sugerido no diálogo de
-- criação antes desta mudança (o aviso de WhatsApp aparecia sempre que a
-- loja tinha número configurado).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS show_whatsapp boolean NOT NULL DEFAULT true;
