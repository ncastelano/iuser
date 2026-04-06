-- Adiciona extensão PostGIS se não existir
CREATE EXTENSION IF NOT EXISTS postgis;

-- Adiciona a coluna location na tabela stores
ALTER TABLE public.stores 
ADD COLUMN IF NOT EXISTS location geography(POINT);

-- Adiciona a coluna location na tabela products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS location geography(POINT);

-- Cria uma função (RPC) para obter os items próximos
-- A função retorna a lista combinada de lojas e produtos,
-- ordenados por distância, baseados numa coordenada
CREATE OR REPLACE FUNCTION get_closest_items(
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  max_distance INT DEFAULT 50000, -- 50 km de busca inicial
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
      ST_Distance(s.location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)) AS distance,
      ST_Y(s.location::geometry) AS lat,
      ST_X(s.location::geometry) AS lng,
      0.0::FLOAT AS rating, -- colocar rating real caso tenha na tabela
      s."storeSlug" AS slug,
      s."storeSlug" AS store_slug,
      0.0::NUMERIC AS price
    FROM stores s
    WHERE s.location IS NOT NULL

    UNION ALL

    SELECT 
      p.id,
      p.type::text AS type, -- 'physical', 'digital', 'service'
      p.name,
      p.description,
      p.image_url AS image_url,
      ST_Distance(p.location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)) AS distance,
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
