-- =====================================================================
-- iUser - CONSOCIATED DATABASE RESTORATION SCRIPT FOR SUPABASE
-- Execute this script in your Supabase SQL Editor to restore all structures.
-- =====================================================================

-- ==========================================
-- 1. EXTENSIONS
-- ==========================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ==========================================
-- 2. BASE TABLES (Profiles & Stores)
-- ==========================================

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    "profileSlug" TEXT UNIQUE,
    avatar_url TEXT,
    upline_id UUID REFERENCES public.profiles(id),
    path ltree,
    whatsapp TEXT,
    theme_mode TEXT DEFAULT 'dark',
    address TEXT,
    show_location BOOLEAN DEFAULT true,
    location geography(POINT),
    cart_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Stores
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
    location geography(POINT),
    calendar_url TEXT,
    whatsapp TEXT,
    address TEXT
);

-- Add missing columns to profiles & stores if they already existed but were incomplete
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "profileSlug" TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS upline_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS path ltree;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'dark';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_location BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location geography(POINT);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cart_data JSONB;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS location geography(POINT);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS calendar_url TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS address TEXT;

-- ==========================================
-- 3. CORE BUSINESS TABLES
-- ==========================================

-- Products
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
    location geography(POINT),
    ratings_avg NUMERIC(3,2) DEFAULT 0.00,
    ratings_count INTEGER DEFAULT 0
);

-- Orders (New system)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    buyer_name TEXT,
    buyer_profile_slug TEXT,
    total_amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'preparing', 'ready', 'paid', 'rejected')),
    checkout_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Order Items (New system)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC NOT NULL,
    total_price NUMERIC NOT NULL
);

-- Store Sales (Legacy fallback table, still used)
CREATE TABLE IF NOT EXISTS public.store_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    checkout_id UUID,
    buyer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    buyer_name TEXT,
    buyer_profile_slug TEXT,
    store_slug TEXT,
    product_id UUID,
    product_name TEXT,
    price NUMERIC NOT NULL,
    quantity INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Appointments
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    service_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'completed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Flash Posts
CREATE TABLE IF NOT EXISTS public.flash_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    title TEXT,
    content TEXT,
    old_price NUMERIC(10,2),
    new_price NUMERIC(10,2),
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Store Views
CREATE TABLE IF NOT EXISTS public.store_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Profile Views (Personal profiles)
CREATE TABLE IF NOT EXISTS public.profile_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    visitor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Follows
CREATE TABLE IF NOT EXISTS public.follows (
    follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (follower_id, following_id)
);

-- ==========================================
-- 4. RATINGS & REVIEWS
-- ==========================================

-- Store Ratings
CREATE TABLE IF NOT EXISTS public.store_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(store_id, profile_id)
);

-- Product Ratings
CREATE TABLE IF NOT EXISTS public.product_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(product_id, profile_id)
);

-- Product Reviews
CREATE TABLE IF NOT EXISTS public.product_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_id UUID,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_anonymous BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(profile_id, product_id, order_id)
);

-- ==========================================
-- 5. SOCIAL MEDIA / MURAL
-- ==========================================

-- Mural Posts
CREATE TABLE IF NOT EXISTS public.mural_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Mural Likes
CREATE TABLE IF NOT EXISTS public.mural_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.mural_posts(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(post_id, profile_id)
);

-- Mural Comments
CREATE TABLE IF NOT EXISTS public.mural_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.mural_posts(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- 6. MLM (MULTI-LEVEL MARKETING) SYSTEM
-- ==========================================

-- MLM Commission Levels
CREATE TABLE IF NOT EXISTS public.commission_levels (
    level INTEGER PRIMARY KEY,
    percentage NUMERIC NOT NULL,
    amount NUMERIC GENERATED ALWAYS AS (1.00 * percentage) STORED
);

INSERT INTO public.commission_levels (level, percentage) VALUES 
(1, 0.30),
(2, 0.25),
(3, 0.20),
(4, 0.15),
(5, 0.10)
ON CONFLICT (level) DO UPDATE SET percentage = EXCLUDED.percentage;

-- MLM Sales
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    commission_pool NUMERIC DEFAULT 1.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- MLM Commissions Earned
CREATE TABLE IF NOT EXISTS public.commissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    earner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    level INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(sale_id, earner_id)
);

-- ==========================================
-- 7. DATABASE VIEWS
-- ==========================================

-- Stores with GeoJSON
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
  address,
  ST_AsGeoJSON(location)::jsonb AS location
FROM public.stores;

-- Products with GeoJSON
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

-- Flash Posts with Stores & Profiles details
CREATE OR REPLACE VIEW public.flash_posts_with_stores AS
SELECT 
    fp.*,
    s.name as store_name,
    s."storeSlug",
    s.logo_url as store_logo,
    p.name as product_name,
    p.slug as product_slug,
    prof."profileSlug"
FROM public.flash_posts fp
JOIN public.stores s ON fp.store_id = s.id
LEFT JOIN public.products p ON fp.product_id = p.id
JOIN public.profiles prof ON s.owner_id = prof.id;

-- ==========================================
-- 8. DATABASE FUNCTIONS & PROCEDURES
-- ==========================================

-- Generate a clean profileSlug
CREATE OR REPLACE FUNCTION public.generate_clean_slug(name_text text, user_id uuid) 
RETURNS text AS $$
DECLARE
    base_slug text;
    new_slug text;
    counter int := 1;
BEGIN
    -- unaccent + lowercase + letters/digits only
    base_slug := lower(unaccent(name_text));
    base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '', 'g');
    
    new_slug := base_slug;
    
    -- Loop to prevent duplicate slug
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE "profileSlug" = new_slug AND id != user_id) LOOP
        new_slug := base_slug || counter::text;
        counter := counter + 1;
    END LOOP;

    RETURN new_slug;
END;
$$ LANGUAGE plpgsql;

-- Trigger logic for inserts in profiles
CREATE OR REPLACE FUNCTION public.handle_profile_insert() 
RETURNS TRIGGER AS $$
BEGIN
    -- Generate unique slug if not set
    IF NEW."profileSlug" IS NULL THEN
        NEW."profileSlug" := public.generate_clean_slug(NEW.name, NEW.id);
    END IF;

    -- Generate MLM path
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

-- Update store rating averages automatically
CREATE OR REPLACE FUNCTION public.update_store_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.stores
    SET 
        ratings_avg = (
            SELECT COALESCE(AVG(rating), 0)::NUMERIC(3,2) 
            FROM public.store_ratings 
            WHERE store_id = COALESCE(NEW.store_id, OLD.store_id)
        ),
        ratings_count = (
            SELECT COUNT(*) 
            FROM public.store_ratings 
            WHERE store_id = COALESCE(NEW.store_id, OLD.store_id)
        )
    WHERE id = COALESCE(NEW.store_id, OLD.store_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Update product rating averages automatically
CREATE OR REPLACE FUNCTION public.update_product_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.products
    SET 
        ratings_avg = (
            SELECT COALESCE(AVG(rating), 0)::NUMERIC(3,2) 
            FROM public.product_ratings 
            WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
        ),
        ratings_count = (
            SELECT COUNT(*) 
            FROM public.product_ratings 
            WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
        )
    WHERE id = COALESCE(NEW.product_id, OLD.product_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Update updated_at automatically
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Distribute commissions dynamically (MLM)
CREATE OR REPLACE FUNCTION public.distribute_commissions() 
RETURNS TRIGGER AS $$
DECLARE
    upline_record RECORD;
BEGIN
    FOR upline_record IN 
        SELECT p.id, cl.percentage, cl.amount
        FROM public.profiles p
        JOIN public.profiles buyer ON buyer.path <@ p.path AND buyer.id != p.id AND buyer.id = NEW.user_id
        JOIN public.commission_levels cl ON cl.level = nlevel(buyer.path) - nlevel(p.path)
        WHERE nlevel(buyer.path) - nlevel(p.path) <= 5
        ORDER BY nlevel(p.path) DESC
    LOOP
        INSERT INTO public.commissions (sale_id, earner_id, amount, level)
        VALUES (
            NEW.id, 
            upline_record.id, 
            upline_record.amount, 
            nlevel((SELECT path FROM public.profiles WHERE id = NEW.user_id)) - nlevel((SELECT path FROM public.profiles WHERE id = upline_record.id))
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Get network downline list up to level 5 (MLM)
CREATE OR REPLACE FUNCTION public.get_downline(parent_id uuid)
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

-- Get network counts per level (MLM)
CREATE OR REPLACE FUNCTION public.get_network_counts(p_user_id uuid)
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

-- Get total commissions of a user (MLM)
CREATE OR REPLACE FUNCTION public.get_total_commissions(user_id uuid)
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

-- Bind a user to an upline parent and recalculate path cascade
CREATE OR REPLACE FUNCTION public.bind_upline(p_user_id uuid, p_upline_id uuid) 
RETURNS void AS $$
DECLARE
    new_path ltree;
    old_path ltree;
    current_upline uuid;
BEGIN
    SELECT upline_id, path INTO current_upline, old_path FROM public.profiles WHERE id = p_user_id;
    
    IF current_upline IS NOT NULL THEN
        RAISE EXCEPTION 'Este usuário já possui um upline e não pode ser realocado.';
    END IF;

    SELECT path || text2ltree(replace(p_user_id::text, '-', '_')) INTO new_path 
    FROM public.profiles 
    WHERE id = p_upline_id;

    -- Update target user
    UPDATE public.profiles 
    SET upline_id = p_upline_id, path = new_path 
    WHERE id = p_user_id;

    -- Cascade update all downlines
    UPDATE public.profiles 
    SET path = new_path || subpath(path, nlevel(old_path)) 
    WHERE path <@ old_path AND id != p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 9. TRIGGERS SETUP
-- ==========================================

-- Profiles insert trigger
DROP TRIGGER IF EXISTS trigger_profile_insert ON public.profiles;
CREATE TRIGGER trigger_profile_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_profile_insert();

-- Store ratings changed trigger
DROP TRIGGER IF EXISTS on_store_rating_changed ON public.store_ratings;
CREATE TRIGGER on_store_rating_changed
AFTER INSERT OR UPDATE OR DELETE ON public.store_ratings
FOR EACH ROW EXECUTE FUNCTION public.update_store_rating_stats();

-- Product ratings changed trigger
DROP TRIGGER IF EXISTS on_product_rating_changed ON public.product_ratings;
CREATE TRIGGER on_product_rating_changed
AFTER INSERT OR UPDATE OR DELETE ON public.product_ratings
FOR EACH ROW EXECUTE FUNCTION public.update_product_rating_stats();

-- Appointments updated_at trigger
DROP TRIGGER IF EXISTS on_appointment_updated ON public.appointments;
CREATE TRIGGER on_appointment_updated
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Sales commissions trigger
DROP TRIGGER IF EXISTS trigger_sales_insert ON public.sales;
CREATE TRIGGER trigger_sales_insert
AFTER INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.distribute_commissions();

-- ==========================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mural_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mural_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mural_comments ENABLE ROW LEVEL SECURITY;

-- 10.1 profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 10.2 stores
DROP POLICY IF EXISTS "Stores are public" ON public.stores;
CREATE POLICY "Stores are public" ON public.stores FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create stores" ON public.stores;
CREATE POLICY "Authenticated users can create stores" ON public.stores FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update their own stores" ON public.stores;
CREATE POLICY "Owners can update their own stores" ON public.stores FOR UPDATE TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete their own stores" ON public.stores;
CREATE POLICY "Owners can delete their own stores" ON public.stores FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- 10.3 products
DROP POLICY IF EXISTS "Products are public" ON public.products;
CREATE POLICY "Products are public" ON public.products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Store owners can insert products" ON public.products;
CREATE POLICY "Store owners can insert products" ON public.products FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = products.store_id AND stores.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Store owners can update products" ON public.products;
CREATE POLICY "Store owners can update products" ON public.products FOR UPDATE 
USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = products.store_id AND stores.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Store owners can delete products" ON public.products;
CREATE POLICY "Store owners can delete products" ON public.products FOR DELETE 
USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = products.store_id AND stores.owner_id = auth.uid()));

-- 10.4 orders
DROP POLICY IF EXISTS "Buyers can view their own orders" ON public.orders;
CREATE POLICY "Buyers can view their own orders" ON public.orders FOR SELECT USING (buyer_id = auth.uid());

DROP POLICY IF EXISTS "Store owners can view orders" ON public.orders;
CREATE POLICY "Store owners can view orders" ON public.orders FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = orders.store_id AND stores.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Anyone can insert orders" ON public.orders;
CREATE POLICY "Anyone can insert orders" ON public.orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Store owners can update orders" ON public.orders;
CREATE POLICY "Store owners can update orders" ON public.orders FOR UPDATE 
USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = orders.store_id AND stores.owner_id = auth.uid()));

-- 10.5 order_items
DROP POLICY IF EXISTS "Users can view order items" ON public.order_items;
CREATE POLICY "Users can view order items" ON public.order_items FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_items.order_id 
      AND (orders.buyer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.stores WHERE stores.id = orders.store_id AND stores.owner_id = auth.uid()))
));

DROP POLICY IF EXISTS "Anyone can insert order items" ON public.order_items;
CREATE POLICY "Anyone can insert order items" ON public.order_items FOR INSERT WITH CHECK (true);

-- 10.6 store_sales
DROP POLICY IF EXISTS "Allow anyone to insert sales" ON public.store_sales;
CREATE POLICY "Allow anyone to insert sales" ON public.store_sales FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow store owners to manage their sales" ON public.store_sales;
CREATE POLICY "Allow store owners to manage their sales" ON public.store_sales FOR ALL 
USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = store_sales.store_id AND stores.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Allow buyers to see their sales" ON public.store_sales;
CREATE POLICY "Allow buyers to see their sales" ON public.store_sales FOR SELECT USING (buyer_id = auth.uid());

-- 10.7 appointments
DROP POLICY IF EXISTS "Clients can view their own appointments" ON public.appointments;
CREATE POLICY "Clients can view their own appointments" ON public.appointments FOR SELECT USING (auth.uid() = client_id);

DROP POLICY IF EXISTS "Store owners can view appointments for their stores" ON public.appointments;
CREATE POLICY "Store owners can view appointments for their stores" ON public.appointments FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = appointments.store_id AND stores.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Clients can create appointment requests" ON public.appointments;
CREATE POLICY "Clients can create appointment requests" ON public.appointments FOR INSERT WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "Store owners can update appointment status" ON public.appointments;
CREATE POLICY "Store owners can update appointment status" ON public.appointments FOR UPDATE 
USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = appointments.store_id AND stores.owner_id = auth.uid()));

-- 10.8 flash_posts
DROP POLICY IF EXISTS "Flash posts are public" ON public.flash_posts;
CREATE POLICY "Flash posts are public" ON public.flash_posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners can manage their flash posts" ON public.flash_posts;
CREATE POLICY "Owners can manage their flash posts" ON public.flash_posts FOR ALL 
USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = flash_posts.store_id AND stores.owner_id = auth.uid()));

-- 10.9 store_views
DROP POLICY IF EXISTS "Users can insert their own views" ON public.store_views;
CREATE POLICY "Users can insert their own views" ON public.store_views FOR INSERT WITH CHECK (auth.uid() = viewer_id);

DROP POLICY IF EXISTS "Store owners can read views" ON public.store_views;
CREATE POLICY "Store owners can read views" ON public.store_views FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = store_views.store_id AND stores.owner_id = auth.uid()));

-- 10.10 profile_views
DROP POLICY IF EXISTS "Profile views are viewable by the profile owner" ON public.profile_views;
CREATE POLICY "Profile views are viewable by the profile owner" ON public.profile_views FOR SELECT USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Anyone can insert profile views" ON public.profile_views;
CREATE POLICY "Anyone can insert profile views" ON public.profile_views FOR INSERT WITH CHECK (true);

-- 10.11 follows
DROP POLICY IF EXISTS "Anyone can see follows" ON public.follows;
CREATE POLICY "Anyone can see follows" ON public.follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can follow others" ON public.follows;
CREATE POLICY "Users can follow others" ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can unfollow" ON public.follows;
CREATE POLICY "Users can unfollow" ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- 10.12 store_ratings
DROP POLICY IF EXISTS "Store ratings viewable by everyone" ON public.store_ratings;
CREATE POLICY "Store ratings viewable by everyone" ON public.store_ratings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can rate stores" ON public.store_ratings;
CREATE POLICY "Authenticated users can rate stores" ON public.store_ratings FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can update their own store ratings" ON public.store_ratings;
CREATE POLICY "Users can update their own store ratings" ON public.store_ratings FOR UPDATE TO authenticated USING (auth.uid() = profile_id);

-- 10.13 product_ratings
DROP POLICY IF EXISTS "Product ratings viewable by everyone" ON public.product_ratings;
CREATE POLICY "Product ratings viewable by everyone" ON public.product_ratings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can rate products" ON public.product_ratings;
CREATE POLICY "Authenticated users can rate products" ON public.product_ratings FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can update their own product ratings" ON public.product_ratings;
CREATE POLICY "Users can update their own product ratings" ON public.product_ratings FOR UPDATE TO authenticated USING (auth.uid() = profile_id);

-- 10.14 product_reviews
DROP POLICY IF EXISTS "Public reviews are viewable by everyone" ON public.product_reviews;
CREATE POLICY "Public reviews are viewable by everyone" ON public.product_reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create reviews for their own purchases" ON public.product_reviews;
CREATE POLICY "Users can create reviews for their own purchases" ON public.product_reviews FOR INSERT WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can update their own reviews" ON public.product_reviews;
CREATE POLICY "Users can update their own reviews" ON public.product_reviews FOR UPDATE USING (auth.uid() = profile_id);

-- 10.15 mural_posts
DROP POLICY IF EXISTS "Mural posts are viewable by everyone" ON public.mural_posts;
CREATE POLICY "Mural posts are viewable by everyone" ON public.mural_posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can post to mural" ON public.mural_posts;
CREATE POLICY "Authenticated users can post to mural" ON public.mural_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can delete their own mural posts" ON public.mural_posts;
CREATE POLICY "Users can delete their own mural posts" ON public.mural_posts FOR DELETE TO authenticated USING (auth.uid() = profile_id);

-- 10.16 mural_likes
DROP POLICY IF EXISTS "Mural likes viewable by everyone" ON public.mural_likes;
CREATE POLICY "Mural likes viewable by everyone" ON public.mural_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can like posts" ON public.mural_likes;
CREATE POLICY "Authenticated users can like posts" ON public.mural_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can unlike their own likes" ON public.mural_likes;
CREATE POLICY "Users can unlike their own likes" ON public.mural_likes FOR DELETE TO authenticated USING (auth.uid() = profile_id);

-- 10.17 mural_comments
DROP POLICY IF EXISTS "Mural comments viewable by everyone" ON public.mural_comments;
CREATE POLICY "Mural comments viewable by everyone" ON public.mural_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can comment" ON public.mural_comments;
CREATE POLICY "Authenticated users can comment" ON public.mural_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.mural_comments;
CREATE POLICY "Users can delete their own comments" ON public.mural_comments FOR DELETE TO authenticated USING (auth.uid() = profile_id);

-- ==========================================
-- 11. STORAGE BUCKETS SETUP & POLICIES
-- ==========================================

-- Initialize buckets if they do not exist
INSERT INTO storage.buckets (id, name, public) VALUES 
('avatars', 'avatars', true),
('store-logos', 'store-logos', true),
('product-images', 'product-images', true),
('mural-images', 'mural-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for Objects (resilient creation using DO block)
DO $$
BEGIN
    -- Public Read
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Read Avatars' AND tablename = 'objects') THEN
        CREATE POLICY "Public Read Avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Read Store Logos' AND tablename = 'objects') THEN
        CREATE POLICY "Public Read Store Logos" ON storage.objects FOR SELECT USING (bucket_id = 'store-logos');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Read Product Images' AND tablename = 'objects') THEN
        CREATE POLICY "Public Read Product Images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Read Mural Images' AND tablename = 'objects') THEN
        CREATE POLICY "Public Read Mural Images" ON storage.objects FOR SELECT USING (bucket_id = 'mural-images');
    END IF;

    -- Upload/Insert
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Upload Avatars' AND tablename = 'objects') THEN
        CREATE POLICY "Upload Avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Upload Store Logos' AND tablename = 'objects') THEN
        CREATE POLICY "Upload Store Logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'store-logos');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Upload Product Images' AND tablename = 'objects') THEN
        CREATE POLICY "Upload Product Images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Upload Mural Images' AND tablename = 'objects') THEN
        CREATE POLICY "Upload Mural Images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'mural-images');
    END IF;

    -- Update/Delete
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Update/Delete Avatars' AND tablename = 'objects') THEN
        CREATE POLICY "Update/Delete Avatars" ON storage.objects FOR ALL USING (bucket_id = 'avatars');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Update/Delete Store Logos' AND tablename = 'objects') THEN
        CREATE POLICY "Update/Delete Store Logos" ON storage.objects FOR ALL USING (bucket_id = 'store-logos');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Update/Delete Product Images' AND tablename = 'objects') THEN
        CREATE POLICY "Update/Delete Product Images" ON storage.objects FOR ALL USING (bucket_id = 'product-images');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Update/Delete Mural Images' AND tablename = 'objects') THEN
        CREATE POLICY "Update/Delete Mural Images" ON storage.objects FOR ALL USING (bucket_id = 'mural-images');
    END IF;
END $$;
