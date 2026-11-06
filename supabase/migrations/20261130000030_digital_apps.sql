-- PROGRAMAS E APLICATIVOS PARA BAIXAR (grátis ou vendidos): um produto digital da loja ganha itens do tipo `app` — um arquivo instalável por plataforma e versão.
--   · `digital_contents.kind` aceita 'app'; cada item de programa tem plataforma (windows/macos/linux/android/ios/web/other), versão, notas da versão (opcional) e o SHA-256 do arquivo
--     (calculado no navegador de quem publica, para o comprador conferir a integridade). Só extensões de instalável/pacote (.exe .msi .dmg .pkg .apk .aab .ipa .appimage .deb .rpm
--     .zip .7z .rar .tar.gz .tgz .jar .msix .appx), conferidas no banco;
--   · ATUALIZAÇÕES INCLUÍDAS: o acesso é do PRODUTO (como sempre) — quem pegou/comprou abre todas as versões, inclusive as novas que o autor publicar depois;
--   · contador de downloads por item (`download_count`): só o servidor conta (1 por pessoa por dia, `digital_downloads`); o dono não consegue mexer no número;
--   · a declaração de autoria (migration 27) passa a valer também para programa (o gatilho exige antes do 1º áudio OU programa);
--   · `get_digital_app_info(produto)` (público) lista as versões para a página do produto; a vitrine passa a contar `apps` (tipo de produto "Programa").
--   · CORRIGE o gatilho `guard_digital_contents` da 14 (ver o comentário dentro da função: a checagem de dono/pasta não valia para quem estava logado);
-- O iUser AINDA NÃO verifica vírus: a tela avisa e mostra o SHA-256. Rollback: supabase/rollbacks/digital_apps_rollback.sql

ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_kind_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_kind_check CHECK (kind IN ('video', 'audio', 'document', 'link', 'app'));
ALTER TABLE public.digital_contents ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE public.digital_contents ADD COLUMN IF NOT EXISTS version text;
ALTER TABLE public.digital_contents ADD COLUMN IF NOT EXISTS release_notes text;
ALTER TABLE public.digital_contents ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE public.digital_contents ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_app_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_app_check CHECK (
    kind <> 'app' OR (
        platform IN ('windows', 'macos', 'linux', 'android', 'ios', 'web', 'other')
        AND version IS NOT NULL AND char_length(btrim(version)) BETWEEN 1 AND 30
        AND storage_path IS NOT NULL
        AND lower(storage_path) ~ '\.(exe|msi|dmg|pkg|apk|aab|ipa|appimage|deb|rpm|zip|7z|rar|tar\.gz|tgz|jar|msix|appx)$'
        AND (release_notes IS NULL OR char_length(release_notes) <= 500)
        AND (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$')));

-- o dono não mexe no contador de downloads (só o servidor)
CREATE OR REPLACE FUNCTION public.guard_digital_contents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
    -- CORREÇÃO DE SEGURANÇA: `current_user` dentro de função SECURITY DEFINER é o DONO dela (nunca 'authenticated'), então a versão da 20261130000014 deixava passar quem estava logado
    -- (dava para pôr conteúdo no produto de outra pessoa ou apontar para o arquivo da pasta alheia). O papel de quem chamou vem do login: auth.role().
    IF COALESCE(auth.role(), '') NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    SELECT owner_id, type INTO p FROM public.products WHERE id = NEW.product_id;
    IF NOT FOUND OR p.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Só o dono do produto edita o conteúdo' USING ERRCODE = '42501'; END IF;
    IF p.type <> 'digital' THEN RAISE EXCEPTION 'O produto precisa ser do tipo digital' USING ERRCODE = '22023'; END IF;
    NEW.owner_id := auth.uid();
    IF NEW.storage_path IS NOT NULL AND split_part(NEW.storage_path, '/', 1) <> auth.uid()::text THEN
        RAISE EXCEPTION 'Arquivo fora da sua pasta' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.product_id IS DISTINCT FROM OLD.product_id THEN RAISE EXCEPTION 'Não dá para mover o item para outro produto' USING ERRCODE = '42501'; END IF;
    IF TG_OP = 'INSERT' THEN NEW.download_count := 0; ELSE NEW.download_count := OLD.download_count; END IF;
    RETURN NEW;
END $$;

-- a declaração de autoria vale para áudio E programa
CREATE OR REPLACE FUNCTION public.digital_audio_rights_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.kind IN ('audio', 'app') AND COALESCE(auth.role(), '') IN ('authenticated', 'anon') AND NOT EXISTS (SELECT 1 FROM public.digital_rights r WHERE r.product_id = NEW.product_id) THEN
        RAISE EXCEPTION 'Declare que a obra é sua (ou que você tem licença) antes de enviar músicas ou programas' USING ERRCODE = '22023', HINT = 'rights_declaration_required';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.digital_audio_rights_guard() FROM PUBLIC, anon, authenticated;

-- 1 download por pessoa por dia conta (só o servidor chama)
CREATE TABLE IF NOT EXISTS public.digital_downloads (
    item_id    uuid NOT NULL REFERENCES public.digital_contents(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    day        date NOT NULL DEFAULT current_date,
    PRIMARY KEY (item_id, profile_id, day)
);
ALTER TABLE public.digital_downloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.digital_downloads FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.track_digital_download(p_item uuid, p_profile uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
    IF p_profile IS NULL THEN RETURN; END IF;
    INSERT INTO public.digital_downloads (item_id, profile_id) SELECT p_item, p_profile WHERE EXISTS (SELECT 1 FROM public.digital_contents WHERE id = p_item AND kind = 'app')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN UPDATE public.digital_contents SET download_count = download_count + 1 WHERE id = p_item; END IF;
END $$;
REVOKE ALL ON FUNCTION public.track_digital_download(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_digital_download(uuid, uuid) TO service_role;

-- as versões do programa para a página do produto (público; sem caminho nem link do arquivo)
CREATE OR REPLACE FUNCTION public.get_digital_app_info(p_product uuid)
RETURNS TABLE (item_id uuid, title text, platform text, version text, release_notes text, sha256 text, size_bytes bigint, download_count integer, created_at timestamptz, unlocked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH me AS (SELECT public._digital_access(p_product, auth.uid()) AS ok)
    SELECT c.id, c.title, c.platform, c.version, c.release_notes, c.sha256, c.size_bytes, c.download_count, c.created_at, (c.is_preview OR (SELECT ok FROM me))
      FROM public.digital_contents c JOIN public.products p ON p.id = c.product_id
     WHERE c.product_id = p_product AND c.kind = 'app' AND p.type = 'digital' AND (p.is_active OR (SELECT ok FROM me))
       AND NOT (public._is_hidden('digital_product', p_product) AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.id = p_product AND x.owner_id = auth.uid()))
     ORDER BY c.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_digital_app_info(uuid) TO anon, authenticated;

-- vitrine: conta também os programas (tipo de produto "Programa")
DROP FUNCTION IF EXISTS public.get_digital_showcase(integer, text);
CREATE FUNCTION public.get_digital_showcase(p_limit integer DEFAULT 24, p_search text DEFAULT NULL)
RETURNS TABLE (id uuid, name text, slug text, description text, image_url text, price numeric, store_id uuid, store_slug text, store_name text, store_logo text,
               view_count integer, created_at timestamptz, videos integer, audios integer, docs integer, links integer, apps integer, seconds bigint, free_items integer,
               preview_item_id uuid, preview_seconds integer, preview_source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.name, p.slug, p.description, p.image_url, p.price, s.id, s."storeSlug", s.name, s.logo_url,
           COALESCE(p.view_count, 0), p.created_at,
           (count(*) FILTER (WHERE c.kind = 'video'))::integer, (count(*) FILTER (WHERE c.kind = 'audio'))::integer,
           (count(*) FILTER (WHERE c.kind = 'document'))::integer, (count(*) FILTER (WHERE c.kind = 'link'))::integer, (count(*) FILTER (WHERE c.kind = 'app'))::integer,
           COALESCE(sum(c.duration_seconds), 0)::bigint, (count(*) FILTER (WHERE c.is_preview))::integer,
           pv.id, pv.duration_seconds, CASE WHEN pv.id IS NULL THEN NULL WHEN pv.is_teaser THEN 'teaser' ELSE 'lesson' END
      FROM public.products p
      JOIN public.stores s ON s.id = p.store_id AND COALESCE(s.is_active, true)
      JOIN public.digital_contents c ON c.product_id = p.id AND NOT c.is_teaser
      LEFT JOIN LATERAL (
            SELECT x.id, x.duration_seconds, x.is_teaser FROM public.digital_contents x
             WHERE x.product_id = p.id AND x.kind = 'video' AND (x.is_teaser OR x.is_preview)
             ORDER BY x.is_teaser DESC, x."position" LIMIT 1) pv ON true
     WHERE p.type = 'digital' AND COALESCE(p.is_active, true) AND p.listing_type = 'sale'
       AND (p_search IS NULL OR btrim(p_search) = '' OR p.name ILIKE '%' || btrim(p_search) || '%' OR COALESCE(p.description, '') ILIKE '%' || btrim(p_search) || '%' OR s.name ILIKE '%' || btrim(p_search) || '%')
     GROUP BY p.id, s.id, pv.id, pv.duration_seconds, pv.is_teaser
     ORDER BY COALESCE(p.view_count, 0) DESC, p.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 100);
$$;
GRANT EXECUTE ON FUNCTION public.get_digital_showcase(integer, text) TO anon, authenticated;
