-- Comunidades que a pessoa guardou na própria lista (achadas pela busca): aparecem sempre pra ela, e as marcadas
-- como "no topo" ficam à frente de tudo. Só a própria pessoa lê e mexe nas suas linhas.
CREATE TABLE IF NOT EXISTS public.community_saved (
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
    pinned boolean NOT NULL DEFAULT false,
    pinned_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, community_id)
);
ALTER TABLE public.community_saved ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ve as proprias comunidades salvas" ON public.community_saved FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Salva na propria lista" ON public.community_saved FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Fixa e desafixa na propria lista" ON public.community_saved FOR UPDATE USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Remove da propria lista" ON public.community_saved FOR DELETE USING (profile_id = auth.uid());
