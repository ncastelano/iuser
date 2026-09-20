-- Locais já usados em "De onde você vai sair" / "Local de chegada" — antes
-- só ficavam no localStorage do aparelho; agora acompanham a conta.
CREATE TABLE IF NOT EXISTS public.saved_ride_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('origin', 'destination')),
    address TEXT NOT NULL,
    lng DOUBLE PRECISION,
    lat DOUBLE PRECISION,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (profile_id, kind, address)
);
CREATE INDEX IF NOT EXISTS saved_ride_places_profile_idx
    ON public.saved_ride_places (profile_id, kind, last_used_at DESC);

ALTER TABLE public.saved_ride_places ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê seus locais salvos" ON public.saved_ride_places
    FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Usuário salva seus locais" ON public.saved_ride_places
    FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Usuário atualiza seus locais salvos" ON public.saved_ride_places
    FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Usuário apaga seus locais salvos" ON public.saved_ride_places
    FOR DELETE USING (auth.uid() = profile_id);
