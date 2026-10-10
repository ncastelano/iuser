-- Editar a própria mensagem nas comunidades (só o texto; o resto da linha fica travado).
ALTER TABLE public.community_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

DROP POLICY IF EXISTS "Editar a própria mensagem" ON public.community_messages;
CREATE POLICY "Editar a própria mensagem" ON public.community_messages FOR UPDATE TO authenticated
    USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

CREATE OR REPLACE FUNCTION public.trg_community_message_edit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.profile_id := OLD.profile_id;
    NEW.community_id := OLD.community_id;
    NEW.created_at := OLD.created_at;
    IF btrim(COALESCE(NEW.content, '')) = '' THEN RAISE EXCEPTION 'A mensagem não pode ficar vazia'; END IF;
    IF NEW.content IS DISTINCT FROM OLD.content THEN NEW.edited_at := now(); END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS community_messages_before_update ON public.community_messages;
CREATE TRIGGER community_messages_before_update BEFORE UPDATE ON public.community_messages
    FOR EACH ROW EXECUTE FUNCTION public.trg_community_message_edit();
