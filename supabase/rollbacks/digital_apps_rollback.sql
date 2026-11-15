-- Desfaz 20261130000030_digital_apps.sql (programas e aplicativos para baixar). Apaga os itens do tipo programa.
DELETE FROM public.digital_contents WHERE kind = 'app';
DROP FUNCTION IF EXISTS public.get_digital_app_info(uuid);
DROP FUNCTION IF EXISTS public.track_digital_download(uuid, uuid);
DROP TABLE IF EXISTS public.digital_downloads;
-- gatilhos voltam ao que eram
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
CREATE OR REPLACE FUNCTION public.digital_audio_rights_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.kind = 'audio' AND COALESCE(auth.role(), '') IN ('authenticated', 'anon') AND NOT EXISTS (SELECT 1 FROM public.digital_rights r WHERE r.product_id = NEW.product_id) THEN
        RAISE EXCEPTION 'Declare que a obra é sua (ou que você tem licença) antes de enviar músicas' USING ERRCODE = '22023', HINT = 'rights_declaration_required';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.digital_audio_rights_guard() FROM PUBLIC, anon, authenticated;
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_app_check;
ALTER TABLE public.digital_contents DROP COLUMN IF EXISTS download_count, DROP COLUMN IF EXISTS sha256, DROP COLUMN IF EXISTS release_notes, DROP COLUMN IF EXISTS version, DROP COLUMN IF EXISTS platform;
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_kind_check;
ALTER TABLE public.digital_contents ADD CONSTRAINT digital_contents_kind_check CHECK (kind IN ('video', 'audio', 'document', 'link'));
-- a vitrine volta à da 20261130000016 (reaplique get_digital_showcase daquele arquivo)
DROP FUNCTION IF EXISTS public.get_digital_showcase(integer, text);
