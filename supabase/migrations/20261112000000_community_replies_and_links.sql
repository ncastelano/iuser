-- Comunidades: responder a outra mensagem e links do iUser que viram cartão.
--  * `community_messages.reply_to_id`: a mensagem responde a outra DA MESMA comunidade (gatilho confere). Se a original for apagada, a
--    resposta continua e só perde a citação (ON DELETE SET NULL).
--  * `resolve_share_link(path)`: transforma o endereço de um link do iUser (/<loja ou perfil> ou /<dono>/<slug do item>) no que ele é
--    (loja, perfil ou item) para montar o cartão. Só dado público; qualquer outro endereço devolve NULL.

ALTER TABLE public.community_messages
    ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.community_messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS community_messages_reply_to_idx ON public.community_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.community_messages_reply_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.community_messages m WHERE m.id = NEW.reply_to_id AND m.community_id = NEW.community_id
    ) THEN
        RAISE EXCEPTION 'A resposta precisa ser a uma mensagem da mesma comunidade.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS community_messages_reply_check ON public.community_messages;
CREATE TRIGGER community_messages_reply_check BEFORE INSERT ON public.community_messages
    FOR EACH ROW EXECUTE FUNCTION public.community_messages_reply_check();

CREATE OR REPLACE FUNCTION public.resolve_share_link(p_path text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    parts text[] := string_to_array(trim(both '/' from split_part(split_part(COALESCE(p_path, ''), '?', 1), '#', 1)), '/');
    n int := COALESCE(array_length(parts, 1), 0);
    sid uuid; pid uuid; prid uuid;
BEGIN
    IF n = 1 AND parts[1] <> '' THEN
        SELECT id INTO sid FROM public.stores WHERE "storeSlug" = parts[1] AND COALESCE(is_active, true) LIMIT 1;
        IF sid IS NOT NULL THEN RETURN jsonb_build_object('kind', 'store', 'id', sid); END IF;
        SELECT id INTO pid FROM public.profiles WHERE "profileSlug" = parts[1] AND COALESCE(is_active, true) AND NOT COALESCE(is_blocked, false) LIMIT 1;
        IF pid IS NOT NULL THEN RETURN jsonb_build_object('kind', 'profile', 'id', pid); END IF;
    ELSIF n = 2 AND parts[1] <> '' AND parts[2] <> '' THEN
        SELECT p.id INTO prid FROM public.products p
        LEFT JOIN public.stores s ON s.id = p.store_id
        LEFT JOIN public.profiles pr ON pr.id = p.owner_id
        WHERE p.slug = parts[2] AND COALESCE(p.is_active, true) AND (s."storeSlug" = parts[1] OR pr."profileSlug" = parts[1]) LIMIT 1;
        IF prid IS NOT NULL THEN RETURN jsonb_build_object('kind', 'product', 'id', prid); END IF;
    END IF;
    RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.resolve_share_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_share_link(text) TO anon, authenticated;
