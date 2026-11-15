-- Desfaz 20261130000014_digital_products.sql (os arquivos do bucket digital-files precisam ser apagados à parte, pelo Storage)
DROP FUNCTION IF EXISTS public.release_digital_order(uuid);
DROP FUNCTION IF EXISTS public.get_my_digital_library();
DROP FUNCTION IF EXISTS public.get_digital_item_access(uuid);
DROP FUNCTION IF EXISTS public.get_digital_curriculum(uuid);
DROP FUNCTION IF EXISTS public._digital_access(uuid, uuid);
DROP TABLE IF EXISTS public.digital_contents;
DROP FUNCTION IF EXISTS public.guard_digital_contents();
DROP POLICY IF EXISTS "storage_insert_digital_files" ON storage.objects;
DROP POLICY IF EXISTS "storage_select_digital_files" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete_digital_files" ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'digital-files' AND NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'digital-files');
