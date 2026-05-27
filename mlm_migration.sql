-- 1. Habilitar as extensões necessárias
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Adicionar as colunas em profiles, se não existirem
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "upline_id" uuid REFERENCES public.profiles(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "path" ltree;
-- Note that profileSlug should already exist and be unique as per the user requests.

-- 3. Função para gerar um profileSlug limpo
CREATE OR REPLACE FUNCTION generate_clean_slug(name_text text, user_id uuid) RETURNS text AS $$
DECLARE
    base_slug text;
    new_slug text;
    counter int := 1;
BEGIN
    -- Remove acentos, transforma tudo para minúsculo e tira caracteres especiais
    base_slug := lower(unaccent(name_text));
    base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '', 'g');
    
    new_slug := base_slug;
    
    -- Loop para encontrar um slug não duplicado (ignorando o proprio user)
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE "profileSlug" = new_slug AND id != user_id) LOOP
        new_slug := base_slug || counter::text;
        counter := counter + 1;
    END LOOP;

    RETURN new_slug;
END;
$$ LANGUAGE plpgsql;

-- 4. Setar os valores para os registros existentes
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id, name FROM public.profiles WHERE "profileSlug" IS NULL OR "path" IS NULL LOOP
        UPDATE public.profiles 
        SET 
            "profileSlug" = COALESCE("profileSlug", generate_clean_slug(r.name, r.id)),
            "path" = COALESCE("path", text2ltree(replace(r.id::text, '-', '_')))
        WHERE id = r.id;
    END LOOP;
END;
$$;

-- 5. Tornar colunas NOT NULL
ALTER TABLE public.profiles ALTER COLUMN "profileSlug" SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN "path" SET NOT NULL;

-- 6. Criar os índices
CREATE INDEX IF NOT EXISTS profiles_upline_idx ON public.profiles ("upline_id");
CREATE INDEX IF NOT EXISTS profiles_path_gist_idx ON public.profiles USING GIST ("path");

-- 7. Triggers para auto-preenchimento
CREATE OR REPLACE FUNCTION handle_profile_insert() RETURNS TRIGGER AS $$
BEGIN
    -- Definir o profileSlug se não vier preenchido
    IF NEW."profileSlug" IS NULL THEN
        NEW."profileSlug" := generate_clean_slug(NEW.name, NEW.id);
    END IF;

    -- Construir o ltree path baseado no upline (se houver parent path, concatena, senão, apenas si mesmo)
    IF NEW.upline_id IS NOT NULL THEN
        SELECT path || text2ltree(replace(NEW.id::text, '-', '_')) INTO NEW.path
        FROM public.profiles
        WHERE id = NEW.upline_id;
    ELSE
        NEW.path := text2ltree(replace(NEW.id::text, '-', '_'));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_profile_insert ON public.profiles;
CREATE TRIGGER trigger_profile_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION handle_profile_insert();

-- ==========================================
-- MLM SYSTEM TABLES
-- ==========================================

-- commission_levels
CREATE TABLE IF NOT EXISTS public.commission_levels (
    level int PRIMARY KEY,
    percentage decimal NOT NULL,
    amount decimal GENERATED ALWAYS AS (1.00 * percentage) STORED
);

INSERT INTO public.commission_levels (level, percentage) VALUES 
(1, 0.30),
(2, 0.25),
(3, 0.20),
(4, 0.15),
(5, 0.10)
ON CONFLICT (level) DO UPDATE SET percentage = EXCLUDED.percentage;

-- sales
CREATE TABLE IF NOT EXISTS public.sales (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount decimal NOT NULL,
    commission_pool decimal DEFAULT 1.00,
    created_at timestamp with time zone DEFAULT now()
);

-- commissions
CREATE TABLE IF NOT EXISTS public.commissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    earner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount decimal NOT NULL,
    level int NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE(sale_id, earner_id)
);

-- ==========================================
-- MLM DISTRIBUTE COMMISSIONS FUNCTION
-- ==========================================

CREATE OR REPLACE FUNCTION distribute_commissions() RETURNS TRIGGER AS $$
DECLARE
    upline_record RECORD;
BEGIN
    -- Busca até 5 ancestrais acima do comprador, ordenados do pai direto para cima
    -- path = A.B.C, descendente = A.B.C.D. Ancestrais são A, B, C. 
    -- Para encontrar, filtramos todos onde este path '<@' parent_path
    
    FOR upline_record IN 
        SELECT p.id, cl.percentage, cl.amount
        FROM public.profiles p
        JOIN public.profiles buyer ON buyer.path <@ p.path AND buyer.id != p.id AND buyer.id = NEW.user_id
        JOIN public.commission_levels cl ON cl.level = nlevel(buyer.path) - nlevel(p.path)
        WHERE nlevel(buyer.path) - nlevel(p.path) <= 5
        ORDER BY nlevel(p.path) DESC
    LOOP
        -- Insere a comissão
        INSERT INTO public.commissions (sale_id, earner_id, amount, level)
        VALUES (NEW.id, upline_record.id, upline_record.amount, nlevel((SELECT path FROM public.profiles WHERE id = NEW.user_id)) - nlevel((SELECT path FROM public.profiles WHERE id = upline_record.id)));
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sales_insert ON public.sales;
CREATE TRIGGER trigger_sales_insert
AFTER INSERT ON public.sales
FOR EACH ROW
EXECUTE FUNCTION distribute_commissions();

-- ==========================================
-- RPCs
-- ==========================================

-- get_downline(parent_id)
CREATE OR REPLACE FUNCTION get_downline(parent_id uuid)
RETURNS TABLE (
    id uuid,
    name text,
    avatar_url text,
    level int,
    created_at timestamp with time zone
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.name,
        d.avatar_url,
        (nlevel(d.path) - nlevel(p.path))::int AS level,
        d.created_at
    FROM public.profiles d
    JOIN public.profiles p ON d.path <@ p.path AND d.id != p.id
    WHERE p.id = parent_id
      AND (nlevel(d.path) - nlevel(p.path)) <= 5
    ORDER BY level ASC, d.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- get_network_counts(user_id)
CREATE OR REPLACE FUNCTION get_network_counts(p_user_id uuid)
RETURNS TABLE (level int, count bigint) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (nlevel(d.path) - nlevel(p.path))::int AS level,
        COUNT(d.id)::bigint AS count
    FROM public.profiles d
    JOIN public.profiles p ON d.path <@ p.path AND d.id != p.id
    WHERE p.id = p_user_id
      AND (nlevel(d.path) - nlevel(p.path)) <= 5
    GROUP BY (nlevel(d.path) - nlevel(p.path));
END;
$$ LANGUAGE plpgsql;

-- get_total_commissions(user_id)
CREATE OR REPLACE FUNCTION get_total_commissions(user_id uuid)
RETURNS decimal AS $$
DECLARE
    total decimal;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO total
    FROM public.commissions
    WHERE earner_id = user_id;

    RETURN total;
END;
$$ LANGUAGE plpgsql;
