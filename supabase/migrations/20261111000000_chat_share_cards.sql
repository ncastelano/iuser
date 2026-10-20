-- Compartilhar loja, serviço/produto, publicação e perfil dentro das conversas e das comunidades, como cartões.
-- Já existiam `direct_messages.ref_product_id` e `ref_request_id`. Aqui entram `ref_store_id` e `ref_profile_id` (conversas) e as
-- referências nas mensagens de comunidade (`community_messages`). Uma publicação ou um serviço é um `products`, então usa `ref_product_id`.
-- Os cartões só mostram dado PÚBLICO (o mesmo que qualquer visitante vê na página da loja/produto/perfil). A leitura passa por
-- `get_share_cards` (security definer, só campos públicos, só itens ativos) e a busca do seletor por `search_share_targets` (login).

ALTER TABLE public.direct_messages
    ADD COLUMN IF NOT EXISTS ref_store_id   uuid REFERENCES public.stores(id)   ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ref_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.community_messages
    ADD COLUMN IF NOT EXISTS ref_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ref_store_id   uuid REFERENCES public.stores(id)   ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ref_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- uma mensagem cita no máximo UM item
ALTER TABLE public.community_messages DROP CONSTRAINT IF EXISTS community_messages_one_ref;
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_one_ref
    CHECK (num_nonnulls(ref_product_id, ref_store_id, ref_profile_id) <= 1);
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_one_ref;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_one_ref
    CHECK (num_nonnulls(ref_product_id, ref_request_id, ref_store_id, ref_profile_id) <= 1);

-- colunas novas legíveis/gravaveis como as outras (a tabela já tem RLS; privilégio de coluna só se a tabela usar grant por coluna)
-- ----------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_share_cards(
    p_products uuid[] DEFAULT '{}', p_stores uuid[] DEFAULT '{}', p_profiles uuid[] DEFAULT '{}'
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'products', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', p.id, 'name', p.name, 'slug', p.slug, 'image_url', p.image_url, 'price', p.price, 'type', p.type,
                'listing_type', p.listing_type, 'description', left(COALESCE(p.description, ''), 140),
                'owner_slug', COALESCE(s."storeSlug", pr."profileSlug"), 'owner_name', COALESCE(s.name, pr.name),
                'ratings_avg', p.ratings_avg, 'ratings_count', p.ratings_count))
            FROM public.products p
            LEFT JOIN public.stores s ON s.id = p.store_id
            LEFT JOIN public.profiles pr ON pr.id = p.owner_id
            WHERE p.id = ANY (p_products[1:200]) AND COALESCE(p.is_active, true)), '[]'::jsonb),
        'stores', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', s.id, 'name', s.name, 'slug', s."storeSlug", 'logo_url', s.logo_url, 'category', s.category,
                'address', s.address, 'ratings_avg', s.ratings_avg, 'ratings_count', s.ratings_count, 'business_hours', s.business_hours,
                'description', left(COALESCE(s.description, ''), 140)))
            FROM public.stores s
            WHERE s.id = ANY (p_stores[1:200]) AND COALESCE(s.is_active, true)), '[]'::jsonb),
        'profiles', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', pr.id, 'name', pr.name, 'slug', pr."profileSlug", 'avatar_url', pr.avatar_url,
                'bio', left(COALESCE(pr.bio, pr.description, ''), 140), 'ratings_avg', pr.ratings_avg, 'ratings_count', pr.ratings_count))
            FROM public.profiles pr
            WHERE pr.id = ANY (p_profiles[1:200]) AND COALESCE(pr.is_active, true) AND NOT COALESCE(pr.is_blocked, false)), '[]'::jsonb)
    );
$$;
REVOKE ALL ON FUNCTION public.get_share_cards(uuid[], uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_share_cards(uuid[], uuid[], uuid[]) TO anon, authenticated;

-- Busca do seletor: devolve ids, o que é seu primeiro. Só para quem está logado.
CREATE OR REPLACE FUNCTION public.search_share_targets(p_kind text, p_q text DEFAULT '', p_limit int DEFAULT 20)
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    q text := '%' || replace(replace(replace(COALESCE(btrim(p_q), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    lim int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 40);
    me uuid := auth.uid();
    ids uuid[];
BEGIN
    IF me IS NULL THEN RAISE EXCEPTION 'login_required'; END IF;
    IF p_kind = 'store' THEN
        SELECT COALESCE(array_agg(id), '{}') INTO ids FROM (
            SELECT s.id FROM public.stores s
            WHERE COALESCE(s.is_active, true) AND (q = '%%' OR s.name ILIKE q OR s."storeSlug" ILIKE q)
            ORDER BY (s.owner_id = me) DESC, s.ratings_count DESC NULLS LAST, s.view_count DESC NULLS LAST LIMIT lim) t;
    ELSIF p_kind IN ('service', 'product', 'publication') THEN
        SELECT COALESCE(array_agg(id), '{}') INTO ids FROM (
            SELECT p.id FROM public.products p
            LEFT JOIN public.stores s ON s.id = p.store_id
            WHERE COALESCE(p.is_active, true)
              AND CASE p_kind
                    WHEN 'service' THEN p.type = 'service' AND p.listing_type IN ('sale', 'service_offer')
                    WHEN 'product' THEN p.type <> 'service' AND p.listing_type = 'sale'
                    ELSE p.listing_type = 'publication' END
              AND (q = '%%' OR p.name ILIKE q)
            ORDER BY (COALESCE(s.owner_id, p.owner_id) = me) DESC, p.ratings_count DESC NULLS LAST, p.view_count DESC NULLS LAST LIMIT lim) t;
    ELSIF p_kind = 'profile' THEN
        SELECT COALESCE(array_agg(id), '{}') INTO ids FROM (
            SELECT pr.id FROM public.profiles pr
            WHERE COALESCE(pr.is_active, true) AND NOT COALESCE(pr.is_blocked, false) AND pr.id <> me
              AND (q = '%%' OR pr.name ILIKE q OR pr."profileSlug" ILIKE q)
            ORDER BY pr.view_count DESC NULLS LAST LIMIT lim) t;
    ELSE
        RAISE EXCEPTION 'tipo_invalido';
    END IF;
    RETURN ids;
END $$;
REVOKE ALL ON FUNCTION public.search_share_targets(text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_share_targets(text, text, int) TO authenticated;
