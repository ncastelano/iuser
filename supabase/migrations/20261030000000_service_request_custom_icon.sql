-- "Outro" no tipo de profissional: além do nome livre (custom_service), a pessoa escolhe um ÍCONE.
-- O app guarda só a chave do ícone (ex: 'camera'); os tipos personalizados mais pedidos entram na lista de tipos
-- (essa contagem já existia no app e agora leva o ícone junto).
ALTER TABLE public.service_requests
    ADD COLUMN IF NOT EXISTS custom_icon text
    CHECK (custom_icon IS NULL OR char_length(custom_icon) <= 30);
