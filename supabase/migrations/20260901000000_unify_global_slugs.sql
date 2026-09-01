-- ====================================================================
-- Migração: Unificação Global de Slugs (Profiles, Stores e Products)
-- Garante que o gerador de slug automático no banco considere todas as entidades
-- ====================================================================

-- Função para verificar se um slug já existe globalmente no banco
CREATE OR REPLACE FUNCTION public.is_slug_taken_globally(
    slug_text text,
    exclude_profile_id uuid DEFAULT NULL,
    exclude_store_id uuid DEFAULT NULL,
    exclude_product_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
    -- Checa em profiles
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE "profileSlug" = slug_text 
        AND (exclude_profile_id IS NULL OR id != exclude_profile_id)
    ) THEN
        RETURN true;
    END IF;

    -- Checa em stores
    IF EXISTS (
        SELECT 1 FROM public.stores 
        WHERE "storeSlug" = slug_text 
        AND (exclude_store_id IS NULL OR id != exclude_store_id)
    ) THEN
        RETURN true;
    END IF;

    -- Checa em products
    IF EXISTS (
        SELECT 1 FROM public.products 
        WHERE slug = slug_text 
        AND (exclude_product_id IS NULL OR id != exclude_product_id)
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atualizar generate_clean_slug para validar em todas as tabelas
CREATE OR REPLACE FUNCTION public.generate_clean_slug(name_text text, user_id uuid DEFAULT NULL) 
RETURNS text AS $$
DECLARE
    base_slug text;
    new_slug text;
    counter int := 1;
BEGIN
    -- Normaliza para minúsculo e remove caracteres especiais
    base_slug := lower(unaccent(coalesce(name_text, 'usuario')));
    base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '', 'g');
    
    IF base_slug = '' THEN
        base_slug := 'usuario';
    END IF;
    
    new_slug := base_slug;
    
    -- Loop de verificação global (profiles, stores e products)
    WHILE public.is_slug_taken_globally(new_slug, user_id, NULL, NULL) LOOP
        new_slug := base_slug || counter::text;
        counter := counter + 1;
    END LOOP;

    RETURN new_slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
