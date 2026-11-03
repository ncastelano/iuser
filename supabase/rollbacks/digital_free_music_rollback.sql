-- Desfaz 20261130000027_digital_free_music.sql (digital grátis + música)
DROP TRIGGER IF EXISTS digital_audio_rights_guard ON public.digital_contents;
DROP FUNCTION IF EXISTS public.digital_audio_rights_guard();
DROP FUNCTION IF EXISTS public.has_digital_rights(uuid);
DROP FUNCTION IF EXISTS public.declare_digital_rights(uuid);
DROP TABLE IF EXISTS public.digital_rights;
DROP FUNCTION IF EXISTS public.get_digital_audio_preview(uuid);
-- prévia volta a ser só vídeo (apaga as prévias em áudio antes de recolocar a regra)
DELETE FROM public.digital_contents WHERE is_teaser AND kind = 'audio';
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_teaser_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_teaser_check CHECK (NOT is_teaser OR (kind = 'video' AND COALESCE(duration_seconds, 0) BETWEEN 1 AND 30));
-- biblioteca e acesso voltam a só enxergar pedidos pagos
CREATE OR REPLACE FUNCTION public._digital_access(p_product uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_uid IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product AND p.owner_id = p_uid)
        OR EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
                    WHERE oi.product_id = p_product AND o.buyer_id = p_uid AND o.status = 'paid'));
$$;
REVOKE ALL ON FUNCTION public._digital_access(uuid, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.my_digital_access(uuid);
CREATE OR REPLACE FUNCTION public.get_my_digital_library()
RETURNS TABLE (product_id uuid, product_name text, product_slug text, store_slug text, store_name text, image_url text, purchased_at timestamptz, items_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.name, p.slug, s."storeSlug", s.name, p.image_url, max(o.created_at),
           (SELECT count(*) FROM public.digital_contents c WHERE c.product_id = p.id AND NOT c.is_teaser)
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id AND o.buyer_id = auth.uid() AND o.status = 'paid'
      JOIN public.products p ON p.id = oi.product_id AND p.type = 'digital'
      LEFT JOIN public.stores s ON s.id = p.store_id
     WHERE auth.uid() IS NOT NULL
     GROUP BY p.id, p.name, p.slug, s."storeSlug", s.name, p.image_url
     ORDER BY max(o.created_at) DESC;
$$;
DROP FUNCTION IF EXISTS public.claim_free_digital(uuid);
DROP TABLE IF EXISTS public.digital_claims;
