-- Cada pessoa pode apagar as próprias mensagens nas comunidades.
DROP POLICY IF EXISTS "Apagar a própria mensagem" ON public.community_messages;
CREATE POLICY "Apagar a própria mensagem" ON public.community_messages FOR DELETE TO authenticated
    USING (auth.uid() = profile_id);
