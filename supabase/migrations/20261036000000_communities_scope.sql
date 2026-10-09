-- Comunidades por alcance: cidade (as de sempre), ESTADO e PAÍS. O chat de Rondônia e o do Brasil já nascem prontos;
-- o de outros estados é criado quando alguém de lá abre a página (igual ao da cidade).
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'city';
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communities_scope_check') THEN
        ALTER TABLE public.communities ADD CONSTRAINT communities_scope_check CHECK (scope IN ('city', 'state', 'country'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS communities_scope_idx ON public.communities (scope, lower(city));

INSERT INTO public.communities (slug, name, city, description, creator_id, scope)
SELECT v.slug, v.name, v.name, v.description,
       (SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE u.email = 'ncastelano@gmail.com' LIMIT 1),
       v.scope
FROM (VALUES
    ('rondonia', 'Rondônia', 'Chat de Rondônia. Converse com o estado todo!', 'state'),
    ('brasil',   'Brasil',   'Chat do Brasil. Converse com gente de todo o país!', 'country')
) AS v(slug, name, description, scope)
WHERE NOT EXISTS (SELECT 1 FROM public.communities c WHERE c.slug = v.slug)
  AND (SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE u.email = 'ncastelano@gmail.com' LIMIT 1) IS NOT NULL;
