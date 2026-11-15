-- Desfaz 20261130000018_storage_bucket_limits.sql: volta os 12 buckets a "sem limite de tamanho e sem restrição de tipo" (estado anterior).
UPDATE storage.buckets
SET file_size_limit = NULL,
    allowed_mime_types = NULL
WHERE id IN ('avatars', 'backgrounds', 'store-logos', 'product-images', 'community-photos', 'service-request-photos',
             'ride-object-photos', 'driver-car-photos', 'driver-selfie-photos', 'mural-images', 'posts', 'store-links');
