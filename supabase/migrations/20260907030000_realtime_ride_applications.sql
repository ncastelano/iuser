-- RideTrackingPanel (Seu pedido em /pedir-motorista) escuta postgres_changes
-- em ride_applications e ride_requests pra atualizar candidatos/status ao
-- vivo. Nenhuma migration anterior nunca adicionou essas tabelas na
-- publicação supabase_realtime — sem isso o Postgres não emite os eventos
-- de troca, e a página só reflete mudanças ao recarregar manualmente.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ride_applications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_applications;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ride_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_requests;
    END IF;
END $$;
