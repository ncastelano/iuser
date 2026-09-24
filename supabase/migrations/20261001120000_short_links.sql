-- Encurtador de links do próprio iuser (iuser.com.br/s/<code>) — usado
-- primeiro pelo bot do WhatsApp, cujo link do carrinho (com o pedido
-- inteiro na query string) fica gigante e assusta antes mesmo de abrir.
-- Só o servidor (service role) cria/lê — mesmo padrão de
-- whatsapp_conversations.

CREATE TABLE IF NOT EXISTS public.short_links (
    code TEXT PRIMARY KEY,
    target_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    click_count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;
