-- Marca a mensagem de chat que já gerou notificação push (evita avisar duas vezes a mesma mensagem).
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS push_notified_at timestamptz;
