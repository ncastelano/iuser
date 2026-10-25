-- Redes sociais públicas de loja e perfil: YouTube, Facebook e X (o Instagram já existia).
-- São dados que a própria pessoa quer mostrar na página, então entram na lista PÚBLICA de colunas (anon/authenticated leem) e o dono as edita.
-- Mesmo critério da Etapa 2.7.1: nova coluna nasce privada; aqui ela é liberada de propósito, por nome, nas três listas
-- (esta migration, src/lib/publicColumns.ts e scripts/test-security-exposure.mjs, que confere as três).
-- Guardamos o que a pessoa digitou (@usuario, usuario ou link); o app só transforma em link se for https do site certo (src/lib/socialLinks.ts).

DO $$
DECLARE
    social_cols text[] := ARRAY['youtube','facebook','x'];
    c text; cols text;
BEGIN
    FOREACH c IN ARRAY social_cols LOOP
        EXECUTE format('ALTER TABLE public.stores   ADD COLUMN IF NOT EXISTS %I text', c);
        EXECUTE format('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS %I text', c);
        EXECUTE format('ALTER TABLE public.stores   DROP CONSTRAINT IF EXISTS %I', 'stores_' || c || '_len');
        EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', 'profiles_' || c || '_len');
        EXECUTE format('ALTER TABLE public.stores   ADD CONSTRAINT %I CHECK (%I IS NULL OR char_length(%I) <= 200)', 'stores_' || c || '_len', c, c);
        EXECUTE format('ALTER TABLE public.profiles ADD CONSTRAINT %I CHECK (%I IS NULL OR char_length(%I) <= 200)', 'profiles_' || c || '_len', c, c);
    END LOOP;

    SELECT string_agg(quote_ident(x), ', ') INTO cols FROM unnest(social_cols) x;
    EXECUTE format('GRANT SELECT (%s) ON public.stores   TO anon, authenticated', cols);
    EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon, authenticated', cols);
    -- escrita: o dono edita a própria loja/perfil (as políticas de linha já restringem a quem)
    EXECUTE format('GRANT UPDATE (%s) ON public.stores   TO authenticated', cols);
    EXECUTE format('GRANT INSERT (%s), UPDATE (%s) ON public.profiles TO authenticated', cols, cols);
END $$;
