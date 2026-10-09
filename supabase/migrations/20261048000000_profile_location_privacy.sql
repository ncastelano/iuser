-- Privacidade da localização do perfil, escolhida pela própria pessoa (Informações do Perfil):
--   show_location   = mostrar a localização no perfil (já existia). Desligado, não aparece em lugar nenhum.
--   show_on_map     = os serviços do perfil aparecem no mapa (Radar)
--   show_in_social  = o endereço aparece no cartão do /social
--   live_location   = localização em tempo real (posição do aparelho, guardada à parte e arredondada)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_on_map boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_in_social boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS live_location boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET show_location = true WHERE show_location IS NULL;

-- "Visto por último" só aparece pra quem a pessoa PEDIR: o padrão passa a ser ninguém (e quem ainda não escolheu volta pra ninguém)
ALTER TABLE public.profile_presence ALTER COLUMN visibility SET DEFAULT 'none';
UPDATE public.profile_presence SET visibility = 'none';

-- Posição em tempo real (fora de profiles, que é legível por todos)
CREATE TABLE IF NOT EXISTS public.profile_live_location (
    profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_live_location ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "A pessoa vê a própria posição" ON public.profile_live_location;
CREATE POLICY "A pessoa vê a própria posição" ON public.profile_live_location FOR SELECT TO authenticated USING (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_live_location_enabled(p_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    UPDATE public.profiles SET live_location = COALESCE(p_on, false) WHERE id = auth.uid();
    IF NOT COALESCE(p_on, false) THEN DELETE FROM public.profile_live_location WHERE profile_id = auth.uid(); END IF;
END; $$;
REVOKE ALL ON FUNCTION public.set_live_location_enabled(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_live_location_enabled(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_live_location(p_lat double precision, p_lng double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL OR p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND live_location) THEN RETURN; END IF;
    INSERT INTO public.profile_live_location (profile_id, lat, lng, updated_at) VALUES (auth.uid(), p_lat, p_lng, now())
    ON CONFLICT (profile_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, updated_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.update_live_location(double precision, double precision) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_live_location(double precision, double precision) TO authenticated;

-- Posição de quem deixou: só com o perfil mostrando localização + tempo real ligado, e recente. Arredondada (~100 m).
CREATE OR REPLACE FUNCTION public.get_live_location_for(p_ids uuid[])
RETURNS TABLE(profile_id uuid, lat double precision, lng double precision, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT l.profile_id, round(l.lat::numeric, 3)::double precision, round(l.lng::numeric, 3)::double precision, l.updated_at
    FROM public.profile_live_location l
    JOIN public.profiles p ON p.id = l.profile_id
    WHERE l.profile_id = ANY (p_ids[1:100])
      AND p.live_location AND COALESCE(p.show_location, true)
      AND l.updated_at > now() - interval '6 hours';
$$;
REVOKE ALL ON FUNCTION public.get_live_location_for(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_live_location_for(uuid[]) TO anon, authenticated, service_role;
