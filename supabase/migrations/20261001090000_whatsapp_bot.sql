-- Bot de WhatsApp por loja (Meta Cloud API). Cada loja tem o próprio
-- número — não um número único da plataforma — então o que identifica de
-- qual loja é uma mensagem recebida é o phone_number_id que a Meta manda
-- junto (não precisa de link/senha especial).
--
-- Fluxo: a loja "pede" o serviço (whatsapp_bot_opt_in, ela mesma liga no
-- próprio painel) → o admin conecta o número de verdade no painel da Meta
-- e cola o phone_number_id aqui (whatsapp_bot_phone_number_id) → só a
-- partir daí o bot responde por aquele número.

ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS whatsapp_bot_opt_in BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS whatsapp_bot_phone_number_id TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS whatsapp_bot_display_number TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_bot_connected_at TIMESTAMPTZ;

-- Só pra saber depois, na tela de pedidos, quais vieram do bot.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp_bot'));

-- Estado da conversa por (telefone do cliente, loja) — o webhook é
-- stateless (cada mensagem é uma chamada HTTP isolada), a conversa
-- acontece em várias mensagens, então o estado precisa ficar salvo entre
-- uma chamada e outra.
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_phone TEXT NOT NULL,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    matched_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    wa_contact_name TEXT,
    state TEXT NOT NULL DEFAULT 'menu',
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_phone_store_idx
    ON public.whatsapp_conversations (wa_phone, store_id);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_store_idx
    ON public.whatsapp_conversations (store_id);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
-- Sem nenhuma policy: só o webhook (service role) lê/escreve aqui — mesmo
-- padrão de public.grant_audit_logs.

-- Dedup de mensagem (a Meta pode reentregar o mesmo webhook) — guarda o
-- id da mensagem processada, com índice único.
CREATE TABLE IF NOT EXISTS public.whatsapp_processed_messages (
    wa_message_id TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_processed_messages ENABLE ROW LEVEL SECURITY;
