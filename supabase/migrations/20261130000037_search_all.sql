-- BUSCA AMPLA: uma só função que procura em tudo que existe no iUser (lojas, pessoas, produtos, serviços, publicações, digitais,
-- imóveis, pedidos de serviço, flashes e comunidades), sem acento e sem diferença de maiúscula, devolvendo SÓ campos públicos.
-- Antes a busca da home só olhava perfis, lojas e o NOME de produto de venda; serviços, publicações, imóveis etc. nunca apareciam.
-- Respeita o que o app já esconde: item inativo, conta bloqueada, conteúdo ocultado por denúncia (_is_hidden) e comunidade não listada.

CREATE OR REPLACE FUNCTION public.search_all(p_term text, p_limit integer DEFAULT 6, p_kind text DEFAULT NULL)
RETURNS TABLE(kind text, id uuid, title text, subtitle text, image text, bucket text, href text, extra text, total integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    t   text := btrim(COALESCE(p_term, ''));
    pat text;
    lim integer := LEAST(GREATEST(COALESCE(p_limit, 6), 1), 40);
BEGIN
    IF char_length(t) < 2 OR char_length(t) > 60 THEN RETURN; END IF;
    pat := '%' || replace(replace(replace(public.unaccent(lower(t)), '\', '\\'), '%', '\%'), '_', '\_') || '%';

    RETURN QUERY
    WITH hits AS (
        -- lojas
        SELECT 'loja'::text AS kind, s.id, s.name::text AS title, COALESCE(NULLIF(s.category, ''), 'Loja')::text AS subtitle, s.logo_url::text AS image, 'store-logos'::text AS bucket,
               ('/' || s."storeSlug")::text AS href, NULL::text AS extra,
               (CASE WHEN public.unaccent(lower(s.name)) LIKE pat THEN 3 ELSE 1 END) AS score, COALESCE(s.view_count, 0) AS pop
        FROM public.stores s JOIN public.profiles o ON o.id = s.owner_id AND o.is_active AND NOT COALESCE(o.is_blocked, false)
        WHERE s.is_active AND (public.unaccent(lower(s.name)) LIKE pat OR public.unaccent(lower(COALESCE(s."storeSlug", ''))) LIKE pat
                               OR public.unaccent(lower(COALESCE(s.description, ''))) LIKE pat OR public.unaccent(lower(COALESCE(s.category, ''))) LIKE pat)
        UNION ALL
        -- pessoas
        SELECT 'pessoa', p.id, p.name::text, ('@' || p."profileSlug")::text, p.avatar_url::text, 'avatars', ('/' || p."profileSlug")::text, NULL,
               (CASE WHEN public.unaccent(lower(COALESCE(p.name, ''))) LIKE pat OR public.unaccent(lower(p."profileSlug")) LIKE pat THEN 3 ELSE 1 END), COALESCE(p.view_count, 0)
        FROM public.profiles p
        WHERE p.is_active AND NOT COALESCE(p.is_blocked, false) AND p."profileSlug" IS NOT NULL
          AND (public.unaccent(lower(COALESCE(p.name, ''))) LIKE pat OR public.unaccent(lower(p."profileSlug")) LIKE pat OR public.unaccent(lower(COALESCE(p.bio, ''))) LIKE pat)
        UNION ALL
        -- produtos, serviços, publicações e digitais (todos em `products`; o tipo define o rótulo)
        SELECT (CASE WHEN pr.type = 'digital' THEN 'digital' WHEN pr.type = 'service' THEN 'servico' WHEN pr.listing_type = 'publication' THEN 'publicacao' ELSE 'produto' END)::text,
               pr.id, pr.name::text,
               (CASE WHEN pr.listing_type = 'publication' THEN 'por ' ELSE 'em ' END || COALESCE(st.name, ow.name, 'iUser'))::text,
               pr.image_url::text, 'product-images',
               ('/' || COALESCE(st."storeSlug", ow."profileSlug") || '/' || COALESCE(pr.slug, pr.id::text))::text,
               (CASE WHEN pr.type = 'service' AND pr.listing_type = 'service_offer' THEN 'Valor a combinar' WHEN COALESCE(pr.price, 0) > 0 THEN 'R$ ' || translate(to_char(pr.price, 'FM999G990D00'), ',.', '.,') ELSE NULL END)::text,
               (CASE WHEN public.unaccent(lower(pr.name)) LIKE pat THEN 3 ELSE 1 END), COALESCE(pr.view_count, 0)
        FROM public.products pr
        LEFT JOIN public.stores st ON st.id = pr.store_id AND st.is_active
        LEFT JOIN public.profiles ow ON ow.id = pr.owner_id AND ow.is_active AND NOT COALESCE(ow.is_blocked, false)
        WHERE pr.is_active AND COALESCE(st."storeSlug", ow."profileSlug") IS NOT NULL
          AND (pr.store_id IS NULL OR st.id IS NOT NULL)
          AND (public.unaccent(lower(pr.name)) LIKE pat OR public.unaccent(lower(COALESCE(pr.description, ''))) LIKE pat OR public.unaccent(lower(COALESCE(pr.category, ''))) LIKE pat
               OR public.unaccent(lower(COALESCE(pr.service_type, ''))) LIKE pat)
        UNION ALL
        -- imóveis para alugar
        SELECT 'imovel', r.id, r.title::text, (COALESCE(r.neighborhood || ', ', '') || COALESCE(r.city, ''))::text, (r.photos)[1]::text, 'product-images', ('/imoveis/' || r.slug)::text,
               ('R$ ' || translate(to_char(r.price, 'FM999G990D00'), ',.', '.,') || (CASE WHEN r.price_period = 'day' THEN '/dia' ELSE '/mês' END))::text,
               (CASE WHEN public.unaccent(lower(r.title)) LIKE pat THEN 3 ELSE 1 END), COALESCE(r.view_count, 0)
        FROM public.rental_listings r
        WHERE r.status = 'active' AND (public.unaccent(lower(r.title)) LIKE pat OR public.unaccent(lower(COALESCE(r.neighborhood, ''))) LIKE pat
               OR public.unaccent(lower(COALESCE(r.city, ''))) LIKE pat OR public.unaccent(lower(COALESCE(r.description, ''))) LIKE pat OR public.unaccent(lower(COALESCE(r.property_type, ''))) LIKE pat)
        UNION ALL
        -- pedidos de serviço em aberto (só rua e bairro; nunca o endereço completo nem quem pediu)
        SELECT 'pedido', q.id, left(COALESCE(NULLIF(btrim(q.description), ''), NULLIF(q.custom_service, ''), q.service_type), 110)::text, COALESCE(q.location_address, '')::text,
               (q.photo_urls)[1]::text, 'service-request-photos', ('/procurar-servico?ver=' || q.id)::text, NULL,
               (CASE WHEN public.unaccent(lower(COALESCE(q.custom_service, q.service_type, ''))) LIKE pat THEN 3 ELSE 1 END), COALESCE(q.view_count, 0)
        FROM public.service_requests q
        WHERE q.status = 'pending' AND (public.unaccent(lower(COALESCE(q.description, ''))) LIKE pat OR public.unaccent(lower(COALESCE(q.custom_service, ''))) LIKE pat
               OR public.unaccent(lower(COALESCE(q.service_type, ''))) LIKE pat)
        UNION ALL
        -- flashes (posts rápidos das pessoas)
        SELECT 'flash', f.id, left(btrim(f.content), 110)::text, ('de ' || COALESCE(a.name, a."profileSlug", 'alguém'))::text,
               (CASE WHEN f.media_type = 'image' THEN f.media_url END)::text, 'flash-media', ('/flash?de=' || f.id)::text, NULL,
               1, COALESCE(f.like_count, 0)
        FROM public.flashes f JOIN public.profiles a ON a.id = f.author_id AND a.is_active AND NOT COALESCE(a.is_blocked, false)
        WHERE public.unaccent(lower(COALESCE(f.content, ''))) LIKE pat AND NOT public._is_hidden('flash', f.id)
        UNION ALL
        -- comunidades abertas à descoberta
        SELECT 'comunidade', c.id, c.name::text, COALESCE(c.city, '')::text, c.image_url::text, 'community-photos', ('/comunidade/' || c.slug)::text, NULL,
               (CASE WHEN public.unaccent(lower(c.name)) LIKE pat THEN 3 ELSE 1 END), 0
        FROM public.communities c
        WHERE COALESCE(c.is_listed, true) AND (public.unaccent(lower(c.name)) LIKE pat OR public.unaccent(lower(COALESCE(c.description, ''))) LIKE pat OR public.unaccent(lower(COALESCE(c.city, ''))) LIKE pat)
    ), ranked AS (
        SELECT h.*, row_number() OVER (PARTITION BY h.kind ORDER BY h.score DESC, h.pop DESC, h.id) AS n, count(*) OVER (PARTITION BY h.kind) AS cnt
        FROM hits h WHERE p_kind IS NULL OR h.kind = p_kind
    )
    SELECT r.kind, r.id, r.title, r.subtitle, r.image, r.bucket, r.href, r.extra, r.cnt::integer
    FROM ranked r WHERE r.n <= lim
    ORDER BY r.kind, r.n;
END; $$;
REVOKE ALL ON FUNCTION public.search_all(text, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.search_all(text, integer, text) TO anon, authenticated, service_role;
