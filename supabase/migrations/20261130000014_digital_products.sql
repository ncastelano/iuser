-- PRODUTOS DIGITAIS (V1, pagamento ainda declarado): a loja vende vídeo-aula, curso, playlist, e-book, planilha... O conteúdo mora num bucket PRIVADO e só abre para quem
-- comprou (pedido `paid` com o produto) ou para o dono. O iUser ainda NÃO recebe esse dinheiro: o cliente paga a chave Pix da loja e a loja libera o acesso
-- (release_digital_order). A cobrança automática (Asaas, subconta + split de valor fixo) é a etapa seguinte e usa o MESMO "pedido pago" como gatilho.
--
--   digital_contents      itens do produto (aula/arquivo/link), em módulos, com "aula grátis" (is_preview). Só o DONO lê/escreve direto; todo o resto é por função.
--   _digital_access       quem pode abrir: dono do produto OU comprador com pedido `paid` com aquele produto.
--   get_digital_curriculum(produto)   o que o produto entrega (títulos, tipo, duração, módulo) + `unlocked`; público (a vitrine mostra o sumário, sem caminho nem link).
--   get_digital_item_access(item)     {allowed, kind, storage_path | external_url, ...} só se liberado (aula grátis ou comprado); a rota /api/digital/open assina o arquivo.
--   get_my_digital_library()          produtos digitais que EU comprei e já foram liberados.
--   release_digital_order(pedido)     a loja (dono) confirma o pagamento de um pedido SÓ de produtos digitais: vai a `paid` e o acesso abre.
-- Rollback: supabase/rollbacks/digital_products_rollback.sql

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('digital-files', 'digital-files', false, 524288000, NULL)
ON CONFLICT (id) DO NOTHING;

-- Envio só na pasta da própria pessoa (<uid>/<produto>/...); ler/trocar/apagar também só o dono. O comprador NUNCA lê o bucket direto: a rota do servidor assina um link curto.
DROP POLICY IF EXISTS "storage_insert_digital_files" ON storage.objects;
CREATE POLICY "storage_insert_digital_files" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'digital-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "storage_select_digital_files" ON storage.objects;
CREATE POLICY "storage_select_digital_files" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'digital-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "storage_delete_digital_files" ON storage.objects;
CREATE POLICY "storage_delete_digital_files" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'digital-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE TABLE IF NOT EXISTS public.digital_contents (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id       uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    owner_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    module_title     text CHECK (module_title IS NULL OR char_length(btrim(module_title)) BETWEEN 1 AND 100),
    title            text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 140),
    kind             text NOT NULL CHECK (kind IN ('video', 'audio', 'document', 'link')),
    storage_path     text,
    external_url     text CHECK (external_url IS NULL OR external_url ~* '^https://'),
    mime_type        text,
    size_bytes       bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
    duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    position         integer NOT NULL DEFAULT 0,
    is_preview       boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT digital_contents_one_source CHECK ((storage_path IS NOT NULL) <> (external_url IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS digital_contents_product_idx ON public.digital_contents (product_id, position);

-- Quem cria é o dono do produto digital e o arquivo fica na pasta dele (impede apontar para o arquivo de outra pessoa)
CREATE OR REPLACE FUNCTION public.guard_digital_contents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    SELECT owner_id, type INTO p FROM public.products WHERE id = NEW.product_id;
    IF NOT FOUND OR p.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Só o dono do produto edita o conteúdo' USING ERRCODE = '42501'; END IF;
    IF p.type <> 'digital' THEN RAISE EXCEPTION 'O produto precisa ser do tipo digital' USING ERRCODE = '22023'; END IF;
    NEW.owner_id := auth.uid();
    IF NEW.storage_path IS NOT NULL AND split_part(NEW.storage_path, '/', 1) <> auth.uid()::text THEN
        RAISE EXCEPTION 'Arquivo fora da sua pasta' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.product_id IS DISTINCT FROM OLD.product_id THEN RAISE EXCEPTION 'Não dá para mover o item para outro produto' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS digital_contents_guard ON public.digital_contents;
CREATE TRIGGER digital_contents_guard BEFORE INSERT OR UPDATE ON public.digital_contents FOR EACH ROW EXECUTE FUNCTION public.guard_digital_contents();

ALTER TABLE public.digital_contents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS digital_contents_owner ON public.digital_contents;
CREATE POLICY digital_contents_owner ON public.digital_contents FOR ALL TO authenticated
    USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
REVOKE ALL ON public.digital_contents FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_contents TO authenticated;

-- ---------------------------------------------------------------- acesso
CREATE OR REPLACE FUNCTION public._digital_access(p_product uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_uid IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product AND p.owner_id = p_uid)
        OR EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
                    WHERE oi.product_id = p_product AND o.buyer_id = p_uid AND o.status = 'paid'));
$$;
REVOKE ALL ON FUNCTION public._digital_access(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_digital_curriculum(p_product uuid)
RETURNS TABLE (id uuid, module_title text, title text, kind text, duration_seconds integer, size_bytes bigint, "position" integer, is_preview boolean, unlocked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH me AS (SELECT public._digital_access(p_product, auth.uid()) AS ok)
    SELECT c.id, c.module_title, c.title, c.kind, c.duration_seconds, c.size_bytes, c."position", c.is_preview, (c.is_preview OR (SELECT ok FROM me)) AS unlocked
      FROM public.digital_contents c
      JOIN public.products p ON p.id = c.product_id
     WHERE c.product_id = p_product AND p.type = 'digital' AND (p.is_active OR (SELECT ok FROM me))
     ORDER BY c."position", c.created_at;
$$;
GRANT EXECUTE ON FUNCTION public.get_digital_curriculum(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_digital_item_access(p_item uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.digital_contents;
BEGIN
    SELECT * INTO c FROM public.digital_contents WHERE id = p_item;
    IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false); END IF;
    IF NOT (c.is_preview OR public._digital_access(c.product_id, auth.uid())) THEN RETURN jsonb_build_object('allowed', false); END IF;
    RETURN jsonb_build_object('allowed', true, 'kind', c.kind, 'title', c.title, 'storage_path', c.storage_path, 'external_url', c.external_url, 'mime_type', c.mime_type);
END $$;
GRANT EXECUTE ON FUNCTION public.get_digital_item_access(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_digital_library()
RETURNS TABLE (product_id uuid, product_name text, product_slug text, store_slug text, store_name text, image_url text, purchased_at timestamptz, items_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.name, p.slug, s."storeSlug", s.name, p.image_url, max(o.created_at),
           (SELECT count(*) FROM public.digital_contents c WHERE c.product_id = p.id)
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id AND o.buyer_id = auth.uid() AND o.status = 'paid'
      JOIN public.products p ON p.id = oi.product_id AND p.type = 'digital'
      LEFT JOIN public.stores s ON s.id = p.store_id
     WHERE auth.uid() IS NOT NULL
     GROUP BY p.id, p.name, p.slug, s."storeSlug", s.name, p.image_url
     ORDER BY max(o.created_at) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_digital_library() TO authenticated;

-- A loja confirma que recebeu o Pix de um pedido SÓ de produtos digitais: o pedido vai a `paid` e o acesso abre.
CREATE OR REPLACE FUNCTION public.release_digital_order(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders; v_non_digital integer;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = o.store_id AND s.owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Só a loja libera o acesso' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_non_digital FROM public.order_items oi LEFT JOIN public.products p ON p.id = oi.product_id WHERE oi.order_id = p_order AND COALESCE(p.type, 'physical') <> 'digital';
    IF v_non_digital > 0 THEN RAISE EXCEPTION 'Este pedido tem itens que não são digitais' USING ERRCODE = '22023'; END IF;
    IF o.status = 'paid' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
    IF o.status NOT IN ('pending', 'preparing', 'ready') THEN RAISE EXCEPTION 'Este pedido não pode mais ser liberado' USING ERRCODE = '22023'; END IF;
    UPDATE public.orders SET status = 'paid' WHERE id = p_order;
    RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.release_digital_order(uuid) TO authenticated;
