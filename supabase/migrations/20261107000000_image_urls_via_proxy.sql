-- Imagens pelo proxy /img (cota do Supabase): troca os links COMPLETOS do Storage de PRODUÇÃO guardados no banco pelo endereço do
-- proxy do site. O proxy (src/app/img/[...path]/route.ts) está no ar desde o PR #18; os links antigos continuavam funcionando, mas
-- cada visualização saía direto do Supabase (Cached Egress). Só mexe em valores que começam EXATAMENTE com o prefixo do Storage de
-- produção; em qualquer outro banco (staging) não casa com nada e não faz nada. Não toca em carrinhos (carts, cart_data: jsonb
-- transitório). Caminhos relativos (produtos, logos) já saem pelo proxy via getPublicUrl. Rollback: supabase/rollbacks/image_urls_via_proxy_rollback.sql
DO $$
DECLARE
    old_p constant text := 'https://mqtwehsmkuknkrtrqbnf.supabase.co/storage/v1/object/public/';
    new_p constant text := 'https://www.iuser.com.br/img/';
BEGIN
    UPDATE public.profiles                   SET avatar_url          = new_p || substr(avatar_url, length(old_p) + 1)          WHERE avatar_url          LIKE old_p || '%';
    UPDATE public.appointments               SET customer_avatar_url = new_p || substr(customer_avatar_url, length(old_p) + 1) WHERE customer_avatar_url LIKE old_p || '%';
    UPDATE public.products                   SET owner_image_url     = new_p || substr(owner_image_url, length(old_p) + 1)     WHERE owner_image_url     LIKE old_p || '%';
    UPDATE public.communities                SET image_url           = new_p || substr(image_url, length(old_p) + 1)           WHERE image_url           LIKE old_p || '%';
    UPDATE public.community_photo_candidates SET image_url           = new_p || substr(image_url, length(old_p) + 1)           WHERE image_url           LIKE old_p || '%';
    UPDATE public.ride_requests              SET object_photo_url    = new_p || substr(object_photo_url, length(old_p) + 1)    WHERE object_photo_url    LIKE old_p || '%';
    UPDATE public.ride_requests              SET pet_photo_url       = new_p || substr(pet_photo_url, length(old_p) + 1)       WHERE pet_photo_url       LIKE old_p || '%';
    UPDATE public.service_requests
       SET photo_urls = ARRAY(SELECT CASE WHEN u LIKE old_p || '%' THEN new_p || substr(u, length(old_p) + 1) ELSE u END FROM unnest(photo_urls) WITH ORDINALITY AS t(u, i) ORDER BY i)
     WHERE EXISTS (SELECT 1 FROM unnest(photo_urls) u WHERE u LIKE old_p || '%');
END $$;
