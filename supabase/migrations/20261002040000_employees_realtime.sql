-- Garante que a tabela employees está na publicação de realtime do
-- Supabase - sem isso, subscribe('postgres_changes', ..., table: 'employees')
-- no client nunca dispara, e o quadro de Funcionários só atualiza com reload
-- manual da página. Idempotente: não falha se já estiver adicionada.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'employees'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
    END IF;
END $$;
