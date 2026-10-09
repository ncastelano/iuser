-- "Visto por último" / "Online agora". Cada pessoa escolhe quem pode ver:
--   'all'       = todo mundo
--   'following' = só quem ela segue (quem ela segue vê quando ela esteve online)
--   'none'      = ninguém (ela ainda vê o próprio)
-- Fica numa tabela à parte (e não em profiles, que é legível por todos) pra a privacidade valer de verdade:
-- o horário só sai pela função get_last_seen_for, que aplica a escolha.
CREATE TABLE IF NOT EXISTS public.profile_presence (
    profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_seen_at timestamptz,
    visibility text NOT NULL DEFAULT 'following' CHECK (visibility IN ('all', 'following', 'none'))
);
ALTER TABLE public.profile_presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "A pessoa vê a própria presença" ON public.profile_presence;
CREATE POLICY "A pessoa vê a própria presença" ON public.profile_presence FOR SELECT TO authenticated USING (profile_id = auth.uid());
-- Sem policy de escrita: só pelas funções abaixo.

-- O app avisa que a pessoa está online (no máximo 1 gravação por minuto)
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RETURN; END IF;
    INSERT INTO public.profile_presence (profile_id, last_seen_at) VALUES (auth.uid(), now())
    ON CONFLICT (profile_id) DO UPDATE SET last_seen_at = now()
    WHERE public.profile_presence.last_seen_at IS NULL OR public.profile_presence.last_seen_at < now() - interval '60 seconds';
END; $$;
REVOKE ALL ON FUNCTION public.touch_last_seen() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_last_seen_visibility(p_value text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    IF p_value NOT IN ('all', 'following', 'none') THEN RAISE EXCEPTION 'Opção inválida'; END IF;
    INSERT INTO public.profile_presence (profile_id, visibility) VALUES (auth.uid(), p_value)
    ON CONFLICT (profile_id) DO UPDATE SET visibility = EXCLUDED.visibility;
END; $$;
REVOKE ALL ON FUNCTION public.set_last_seen_visibility(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_last_seen_visibility(text) TO authenticated;

-- Quando cada perfil esteve online, SÓ para quem a escolha dele deixa ver
CREATE OR REPLACE FUNCTION public.get_last_seen_for(p_ids uuid[])
RETURNS TABLE(profile_id uuid, last_seen_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT pr.profile_id, pr.last_seen_at
    FROM public.profile_presence pr
    WHERE pr.profile_id = ANY (p_ids[1:200])
      AND pr.last_seen_at IS NOT NULL
      AND (
          pr.profile_id = auth.uid()
          OR pr.visibility = 'all'
          OR (pr.visibility = 'following' AND auth.uid() IS NOT NULL
              AND EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = pr.profile_id AND f.following_id = auth.uid()))
      );
$$;
REVOKE ALL ON FUNCTION public.get_last_seen_for(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_last_seen_for(uuid[]) TO anon, authenticated, service_role;
