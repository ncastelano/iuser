-- Create the mural-images bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('mural-images', 'mural-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for mural-images bucket
-- 1. Allow anyone to view images
CREATE POLICY "Public Read"
ON storage.objects FOR SELECT
USING (bucket_id = 'mural-images');

-- 2. Allow authenticated users to upload mural images
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'mural-images');

-- 3. Allow users to update their own mural images
CREATE POLICY "Owner Update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'mural-images' AND (auth.uid())::text = (storage.foldername(name))[2]);

-- 4. Allow users to delete their own mural images
CREATE POLICY "Owner Delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'mural-images' AND (auth.uid())::text = (storage.foldername(name))[2]);
