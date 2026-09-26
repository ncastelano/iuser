-- Garante que delivery_assignments está na publicação de realtime do
-- Supabase. StoreOrders.tsx nunca precisou disso (recarrega sozinho, local,
-- logo após atribuir um pedido), mas StoreDashboard.tsx/Employee.tsx
-- (seção "Funcionários") depende de escutar essa tabela pra saber que uma
-- atribuição foi feita em outra aba/seção da mesma página - sem isso, a
-- subscribe('postgres_changes', ..., table: 'delivery_assignments') no
-- client nunca dispara, e o quadro de Funcionários fica preso no que foi
-- carregado na abertura da página. Idempotente: não falha se já estiver
-- adicionada.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'delivery_assignments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_assignments;
    END IF;
END $$;
