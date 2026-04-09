-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Stores table (with geography location)
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  "storeSlug" TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_open BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  opening_hours JSONB,
  meta_title TEXT,
  meta_description TEXT,
  ratings_avg NUMERIC(3,2) DEFAULT 0.00,
  ratings_count INTEGER DEFAULT 0,
  prep_time_min INTEGER,
  prep_time_max INTEGER,
  price_min NUMERIC(10,2),
  price_max NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  location geography(POINT)
);

-- Products table (with geography location)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type = ANY (array['physical','digital','service'])),
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  location geography(POINT)
);

-- View exposing stores with GeoJSON location
DROP VIEW IF EXISTS public.stores_geo;

CREATE OR REPLACE VIEW public.stores_geo AS
SELECT
  id,
  name,
  "storeSlug",
  description,
  logo_url,
  banner_url,
  owner_id,
  is_open,
  is_active,
  opening_hours,
  meta_title,
  meta_description,
  ratings_avg,
  ratings_count,
  prep_time_min,
  prep_time_max,
  price_min,
  price_max,
  created_at,
  ST_AsGeoJSON(location)::jsonb AS location
FROM public.stores;

-- View exposing products with GeoJSON location
DROP VIEW IF EXISTS public.products_geo;

CREATE OR REPLACE VIEW public.products_geo AS
SELECT
  id,
  name,
  slug,
  description,
  price,
  type,
  is_active,
  image_url,
  store_id,
  ST_AsGeoJSON(location)::jsonb AS location
FROM public.products;
