-- Trava do Storage (Etapa 2.7.2). Antes: 77 políticas sobrepostas em storage.objects; quatro buckets (avatars, mural-images,
-- product-images, store-logos) aceitavam INSERT/UPDATE/DELETE de QUALQUER PESSOA sem login (papel public), e qualquer
-- logado podia sobrescrever avatares alheios ou enviar para qualquer bucket. Os buckets continuam PÚBLICOS para leitura
-- por URL (/object/public/...: não passa por política), mas ninguém mais LISTA os arquivos (o app nunca lista).
--
-- Modelo novo (tudo para o papel authenticated; anon não escreve nem lista nada):
--  * INSERT: avatars, backgrounds, mural-images, product-images, store-logos = qualquer caminho (o app usa nomes planos);
--            community-photos, driver-car-photos, driver-selfie-photos, posts, ride-object-photos, service-request-photos,
--            store-links = só dentro da pasta do próprio usuário (<auth.uid()>/...), como o app já faz.
--  * SELECT/UPDATE/DELETE: só do dono do arquivo (owner = auth.uid(), ou a pasta é do próprio usuário). SELECT próprio é
--    necessário para upsert/remove/RETURNING da API de Storage.
-- service_role (rotas /api, scripts de manutenção) ignora RLS e segue funcionando.
-- Rollback: supabase/rollbacks/storage_lockdown_rollback.sql (recria as 77 políticas antigas, reabrindo a escrita anônima).

DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' LOOP
        EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
    END LOOP;
END $$;

CREATE POLICY "storage_insert_flat" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('avatars', 'backgrounds', 'mural-images', 'product-images', 'store-logos'));

CREATE POLICY "storage_insert_own_folder" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('community-photos', 'driver-car-photos', 'driver-selfie-photos', 'posts',
                              'ride-object-photos', 'service-request-photos', 'store-links')
                AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "storage_select_own" ON storage.objects FOR SELECT TO authenticated
    USING (owner = (SELECT auth.uid()) OR (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "storage_update_own" ON storage.objects FOR UPDATE TO authenticated
    USING (owner = (SELECT auth.uid()) OR (storage.foldername(name))[1] = (SELECT auth.uid())::text)
    WITH CHECK (owner = (SELECT auth.uid()) OR (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "storage_delete_own" ON storage.objects FOR DELETE TO authenticated
    USING (owner = (SELECT auth.uid()) OR (storage.foldername(name))[1] = (SELECT auth.uid())::text);
