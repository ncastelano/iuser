-- Comunidades: salas de conversa por cidade, criadas por usuários (até 3 por pessoa,
-- checado em app), sem chat em tempo real (histórico completo carregado ao entrar).
CREATE TABLE IF NOT EXISTS public.communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    description TEXT,
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS communities_city_idx ON public.communities (lower(city));
CREATE INDEX IF NOT EXISTS communities_creator_idx ON public.communities (creator_id);

CREATE TABLE IF NOT EXISTS public.community_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (community_id, profile_id)
);
CREATE INDEX IF NOT EXISTS community_members_profile_idx ON public.community_members (profile_id);

CREATE TABLE IF NOT EXISTS public.community_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_messages_community_idx ON public.community_messages (community_id, created_at);

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

-- Leitura pública (lista, membros e mensagens são visíveis pra qualquer um, logado ou não)
CREATE POLICY "Comunidades são públicas" ON public.communities FOR SELECT USING (true);
CREATE POLICY "Membros são públicos" ON public.community_members FOR SELECT USING (true);
CREATE POLICY "Mensagens são públicas" ON public.community_messages FOR SELECT USING (true);

-- Escrita exige ser o próprio usuário autenticado
CREATE POLICY "Criar comunidade autenticado" ON public.communities FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Entrar em comunidade" ON public.community_members FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Sair de comunidade" ON public.community_members FOR DELETE USING (auth.uid() = profile_id);
CREATE POLICY "Enviar mensagem" ON public.community_messages FOR INSERT WITH CHECK (auth.uid() = profile_id);
