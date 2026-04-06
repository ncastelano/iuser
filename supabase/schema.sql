-- ==========================================
-- SCRIPT DE INICIALIZAÇÃO BÁSICA
-- (Sobrescrevendo todo o banco complexo)
-- ==========================================

-- Limpeza Total dos enums criados anteriormente (DDD)
DROP TYPE IF EXISTS public.role_type CASCADE;
DROP TYPE IF EXISTS public.product_type CASCADE;
DROP TYPE IF EXISTS public.order_status CASCADE;
DROP TYPE IF EXISTS public.payment_status CASCADE;
DROP TYPE IF EXISTS public.transaction_type CASCADE;

-- Limpeza Total de TODAS as tabelas criadas anteriormente (Marketplace)
DROP TABLE IF EXISTS public.event_logs CASCADE;
DROP TABLE IF EXISTS public.idempotency_keys CASCADE;
DROP TABLE IF EXISTS public.reports CASCADE;
DROP TABLE IF EXISTS public.user_blocks CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.user_reviews CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.comments CASCADE;
DROP TABLE IF EXISTS public.likes CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.wallets CASCADE;
DROP TABLE IF EXISTS public.refunds CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.order_services CASCADE;
DROP TABLE IF EXISTS public.order_digital_access CASCADE;
DROP TABLE IF EXISTS public.order_shipping CASCADE;
DROP TABLE IF EXISTS public.order_status_history CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.cart_items CASCADE;
DROP TABLE IF EXISTS public.carts CASCADE;
DROP TABLE IF EXISTS public.product_categories CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.product_stats CASCADE;
DROP TABLE IF EXISTS public.product_images CASCADE;
DROP TABLE IF EXISTS public.product_services CASCADE;
DROP TABLE IF EXISTS public.product_digital_content CASCADE;
DROP TABLE IF EXISTS public.product_digital CASCADE;
DROP TABLE IF EXISTS public.product_physical CASCADE;
DROP TABLE IF EXISTS public.variant_options CASCADE;
DROP TABLE IF EXISTS public.product_variants CASCADE;
DROP TABLE IF EXISTS public.store_stats CASCADE;
DROP TABLE IF EXISTS public.store_members CASCADE;
DROP TABLE IF EXISTS public.user_stats CASCADE;

-- O ÚNICO DROP NECESSÁRIO E recriação
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ==========================================
-- TABELA UNIQUE FINAL - PROFILES
-- ==========================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS (Row Level Security) básico nesta tabela
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- REGRAS DE SEGURANÇA (RLS) PARA PROFILES
-- ==========================================
-- 1. Leitura: Quem pode ver o perfil (Todos, pois é um app/marketplace)
CREATE POLICY "Leitura pública de perfis" ON public.profiles FOR SELECT USING (true);

-- 2. Inserção: O próprio usuário cria seu perfil no momento do cadastro (cliente)
CREATE POLICY "Usuários criam suas profiles" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 3. Atualização: O usuário só pode editar o próprio perfil (nome, avatar)
CREATE POLICY "Usuários podem atualizar a própria profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 4. Exclusão: O usuário pode excluir a própria conta (Opcional, mas boa prática)
CREATE POLICY "Usuários podem excluir o próprio perfil" ON public.profiles FOR DELETE USING (auth.uid() = id);

-- ==========================================
-- REGRAS E BUCKET DE STORAGE (AVATARES/FOTOS)
-- ==========================================
-- Criar o bucket automaticamente via SQL para não precisar ir no painel (Dashboard)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true) 
ON CONFLICT (id) DO NOTHING;

-- Garantir que políticas de storage.objects não dupliquem se rodar várias vezes
DROP POLICY IF EXISTS "Leitura pública de avatares" ON storage.objects;
DROP POLICY IF EXISTS "Usuários inserem próprios avatares" ON storage.objects;
DROP POLICY IF EXISTS "Usuários atualizam próprios avatares" ON storage.objects;
DROP POLICY IF EXISTS "Usuários deletam próprios avatares" ON storage.objects;

-- Regras de RLS para os arquivos enviados (Storage)
CREATE POLICY "Leitura pública de avatares" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Usuários inserem próprios avatares" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid() = owner);
CREATE POLICY "Usuários atualizam próprios avatares" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid() = owner);
CREATE POLICY "Usuários deletam próprios avatares" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid() = owner);

-- ==========================================
-- TRIGGER DE CRIAÇÃO AUTOMÁTICA DE PERFIL
-- ==========================================
-- 1. Remove qualquer trigger ou função antiga (para parar de dar "Database error saving new user")
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 2. Cria a função que copia os dados do Auth para a Profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar_url)
  VALUES (
    NEW.id,
    -- Pega o nome do metadata do signUp, se não existir pega a primeira parte do email
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  -- Se o perfil de alguma forma já existir (por erro de concorrência ou sync), apenas ignora e não quebra a transação
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Reconecta o trigger com o Auth (dispara ao confirmar o cadastro no frontend)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==========================================
-- SCRIPT DE LOJAS E PRODUTOS (GARANTINDO EXISTÊNCIA)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    "storeSlug" TEXT UNIQUE NOT NULL,
    description TEXT,
    logo_url TEXT,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    type TEXT NOT NULL,
    image_url TEXT,
    address TEXT,
    city TEXT,
    location geography(POINT),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- SCRIPT DE MAPAS E GEOLOCALIZAÇÃO
-- ==========================================
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS location geography(POINT);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS location geography(POINT);

CREATE OR REPLACE FUNCTION get_closest_items(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  max_distance INT DEFAULT 50000, 
  limit_num INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  name TEXT,
  description TEXT,
  image_url TEXT,
  distance FLOAT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  rating FLOAT,
  slug TEXT,
  store_slug TEXT,
  price NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    SELECT 
      s.id,
      'loja' AS type,
      s.name,
      s.description,
      s.logo_url AS image_url,
      ST_Distance(s.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)) AS distance,
      ST_Y(s.location::geometry) AS lat,
      ST_X(s.location::geometry) AS lng,
      0.0::FLOAT AS rating,
      s."storeSlug" AS slug,
      s."storeSlug" AS store_slug,
      0.0::NUMERIC AS price
    FROM stores s
    WHERE s.location IS NOT NULL

    UNION ALL

    SELECT 
      p.id,
      p.type::text AS type,
      p.name,
      p.description,
      p.image_url AS image_url,
      ST_Distance(p.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)) AS distance,
      ST_Y(p.location::geometry) AS lat,
      ST_X(p.location::geometry) AS lng,
      0.0::FLOAT AS rating,
      p.slug AS slug,
      (SELECT "storeSlug" FROM stores WHERE id = p.store_id) AS store_slug,
      p.price AS price
    FROM products p
    WHERE p.location IS NOT NULL
  ) q
  WHERE q.distance <= max_distance
  ORDER BY q.distance ASC
  LIMIT limit_num;
END;
$$;

-- ==========================================
-- FIM DO SCRIPT
-- ==========================================