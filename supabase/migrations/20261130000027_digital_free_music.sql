-- DIGITAL GRÁTIS + MÚSICA (Fase 1): três peças em cima dos produtos digitais da 14/15/16.
--   1) GRÁTIS: produto digital com preço 0 não passa por pedido nem por "a loja libera". A pessoa logada toca em "Adicionar à minha biblioteca" e o banco registra
--      o direito em `digital_claims` (`claim_free_digital`); `_digital_access` e a biblioteca passam a reconhecer esse registro. O direito vale para sempre (se o artista
--      cobrar depois, quem já pegou continua com acesso). Ninguém lê nem escreve `digital_claims` direto: só pelas funções.
--   2) PRÉVIA EM ÁUDIO: a "prévia curta" (is_teaser, 1 a 30 s) agora pode ser vídeo OU áudio. `get_digital_audio_preview(produto)` entrega ao público o id e a duração da prévia
--      em áudio (o arquivo abre pela rota /api/digital/open, que já libera is_teaser). A vitrine continua tocando só vídeo (a escolha de vídeo lá já exige kind='video').
--   3) AUTORIA: antes de entrar o primeiro ÁUDIO em um produto, o dono declara que a obra é dele (ou que tem licença) — `declare_digital_rights`. Um gatilho recusa
--      áudio novo sem a declaração (HINT rights_declaration_required). Fica registrado quem declarou e quando (`digital_rights`).
-- Rollback: supabase/rollbacks/digital_free_music_rollback.sql

-- ---------------------------------------------------------------- 1) grátis
CREATE TABLE IF NOT EXISTS public.digital_claims (
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, product_id)
);
ALTER TABLE public.digital_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.digital_claims FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_free_digital(p_product uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products; v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para pegar' USING ERRCODE = '42501'; END IF;
    SELECT * INTO p FROM public.products WHERE id = p_product;
    IF NOT FOUND OR p.type <> 'digital' OR NOT COALESCE(p.is_active, false) THEN RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = '22023'; END IF;
    IF COALESCE(p.price, 0) <> 0 THEN RAISE EXCEPTION 'Este produto não é grátis' USING ERRCODE = '22023', HINT = 'not_free'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.digital_contents c WHERE c.product_id = p_product AND NOT c.is_teaser) THEN
        RAISE EXCEPTION 'Este produto ainda não tem conteúdo' USING ERRCODE = '22023', HINT = 'no_content';
    END IF;
    INSERT INTO public.digital_claims (profile_id, product_id) VALUES (v_uid, p_product) ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.claim_free_digital(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_free_digital(uuid) TO authenticated;

-- quem pode abrir: dono do produto, comprador com pedido pago OU quem pegou o grátis
CREATE OR REPLACE FUNCTION public._digital_access(p_product uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_uid IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product AND p.owner_id = p_uid)
        OR EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
                    WHERE oi.product_id = p_product AND o.buyer_id = p_uid AND o.status = 'paid')
        OR EXISTS (SELECT 1 FROM public.digital_claims dc WHERE dc.product_id = p_product AND dc.profile_id = p_uid));
$$;
REVOKE ALL ON FUNCTION public._digital_access(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- a página do produto pergunta: "eu já tenho este?"
CREATE OR REPLACE FUNCTION public.my_digital_access(p_product uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT public._digital_access(p_product, auth.uid());
$$;
REVOKE ALL ON FUNCTION public.my_digital_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_digital_access(uuid) TO authenticated;

-- biblioteca: o que comprei (pago) + o que peguei de graça
CREATE OR REPLACE FUNCTION public.get_my_digital_library()
RETURNS TABLE (product_id uuid, product_name text, product_slug text, store_slug text, store_name text, image_url text, purchased_at timestamptz, items_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.name, p.slug, s."storeSlug", s.name, p.image_url, max(x.at),
           (SELECT count(*) FROM public.digital_contents c WHERE c.product_id = p.id AND NOT c.is_teaser)
      FROM (
            SELECT oi.product_id, o.created_at AS at
              FROM public.order_items oi
              JOIN public.orders o ON o.id = oi.order_id AND o.buyer_id = auth.uid() AND o.status = 'paid'
            UNION ALL
            SELECT dc.product_id, dc.created_at FROM public.digital_claims dc WHERE dc.profile_id = auth.uid()
           ) x
      JOIN public.products p ON p.id = x.product_id AND p.type = 'digital'
      LEFT JOIN public.stores s ON s.id = p.store_id
     WHERE auth.uid() IS NOT NULL
     GROUP BY p.id, p.name, p.slug, s."storeSlug", s.name, p.image_url
     ORDER BY max(x.at) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_digital_library() TO authenticated;

-- ---------------------------------------------------------------- 2) prévia em áudio
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_teaser_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_teaser_check CHECK (NOT is_teaser OR (kind IN ('video', 'audio') AND COALESCE(duration_seconds, 0) BETWEEN 1 AND 30));

CREATE OR REPLACE FUNCTION public.get_digital_audio_preview(p_product uuid)
RETURNS TABLE (item_id uuid, duration_seconds integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT c.id, c.duration_seconds
      FROM public.digital_contents c
      JOIN public.products p ON p.id = c.product_id
     WHERE c.product_id = p_product AND p.type = 'digital' AND p.is_active AND c.is_teaser AND c.kind = 'audio'
     ORDER BY c.created_at DESC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_digital_audio_preview(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------- 3) autoria
CREATE TABLE IF NOT EXISTS public.digital_rights (
    product_id  uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
    owner_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    declared_at timestamptz NOT NULL DEFAULT now(),
    statement   text NOT NULL DEFAULT 'own_or_licensed'
);
ALTER TABLE public.digital_rights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.digital_rights FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.declare_digital_rights(p_product uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product AND p.owner_id = v_uid AND p.type = 'digital') THEN
        RAISE EXCEPTION 'Só quem publica o produto pode declarar a autoria' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.digital_rights (product_id, owner_id) VALUES (p_product, v_uid) ON CONFLICT (product_id) DO NOTHING;
    RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.declare_digital_rights(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declare_digital_rights(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_digital_rights(p_product uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.digital_rights r WHERE r.product_id = p_product AND r.owner_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.has_digital_rights(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_digital_rights(uuid) TO authenticated;

-- áudio novo só entra com a declaração (quem não vem de um login — serviço, seeds — passa; `auth.role()` e não `current_user`, que numa função SECURITY DEFINER é o dono dela)
CREATE OR REPLACE FUNCTION public.digital_audio_rights_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.kind = 'audio' AND COALESCE(auth.role(), '') IN ('authenticated', 'anon') AND NOT EXISTS (SELECT 1 FROM public.digital_rights r WHERE r.product_id = NEW.product_id) THEN
        RAISE EXCEPTION 'Declare que a obra é sua (ou que você tem licença) antes de enviar músicas' USING ERRCODE = '22023', HINT = 'rights_declaration_required';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.digital_audio_rights_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS digital_audio_rights_guard ON public.digital_contents;
CREATE TRIGGER digital_audio_rights_guard BEFORE INSERT ON public.digital_contents FOR EACH ROW EXECUTE FUNCTION public.digital_audio_rights_guard();
