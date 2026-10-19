-- ROLLBACK da migration 20261107000000_image_urls_via_proxy.sql: devolve os links do proxy para os links diretos do Storage de produção.
-- Rodar: npx supabase db query --linked -f supabase/rollbacks/image_urls_via_proxy_rollback.sql
DO $$
DECLARE
    old_p constant text := 'https://mqtwehsmkuknkrtrqbnf.supabase.co/storage/v1/object/public/';
    new_p constant text := 'https://www.iuser.com.br/img/';
BEGIN
    UPDATE public.profiles                   SET avatar_url          = old_p || substr(avatar_url, length(new_p) + 1)          WHERE avatar_url          LIKE new_p || '%';
    UPDATE public.appointments               SET customer_avatar_url = old_p || substr(customer_avatar_url, length(new_p) + 1) WHERE customer_avatar_url LIKE new_p || '%';
    UPDATE public.products                   SET owner_image_url     = old_p || substr(owner_image_url, length(new_p) + 1)     WHERE owner_image_url     LIKE new_p || '%';
    UPDATE public.communities                SET image_url           = old_p || substr(image_url, length(new_p) + 1)           WHERE image_url           LIKE new_p || '%';
    UPDATE public.community_photo_candidates SET image_url           = old_p || substr(image_url, length(new_p) + 1)           WHERE image_url           LIKE new_p || '%';
    UPDATE public.ride_requests              SET object_photo_url    = old_p || substr(object_photo_url, length(new_p) + 1)    WHERE object_photo_url    LIKE new_p || '%';
    UPDATE public.ride_requests              SET pet_photo_url       = old_p || substr(pet_photo_url, length(new_p) + 1)       WHERE pet_photo_url       LIKE new_p || '%';
    UPDATE public.service_requests
       SET photo_urls = ARRAY(SELECT CASE WHEN u LIKE new_p || '%' THEN old_p || substr(u, length(new_p) + 1) ELSE u END FROM unnest(photo_urls) WITH ORDINALITY AS t(u, i) ORDER BY i)
     WHERE EXISTS (SELECT 1 FROM unnest(photo_urls) u WHERE u LIKE new_p || '%');
END $$;
