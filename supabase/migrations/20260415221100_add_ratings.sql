-- Add rating columns to products table if they don't exist
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS ratings_avg NUMERIC(3,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS ratings_count INTEGER DEFAULT 0;

-- Create store_ratings table
CREATE TABLE IF NOT EXISTS public.store_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(store_id, profile_id)
);

-- Create product_ratings table
CREATE TABLE IF NOT EXISTS public.product_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(product_id, profile_id)
);

-- Enable RLS
ALTER TABLE public.store_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_ratings ENABLE ROW LEVEL SECURITY;

-- Policies for store_ratings
CREATE POLICY "Store ratings viewable by everyone" 
ON public.store_ratings FOR SELECT USING (true);

CREATE POLICY "Authenticated users can rate stores" 
ON public.store_ratings FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can update their own store ratings" 
ON public.store_ratings FOR UPDATE TO authenticated 
USING (auth.uid() = profile_id);

-- Policies for product_ratings
CREATE POLICY "Product ratings viewable by everyone" 
ON public.product_ratings FOR SELECT USING (true);

CREATE POLICY "Authenticated users can rate products" 
ON public.product_ratings FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can update their own product ratings" 
ON public.product_ratings FOR UPDATE TO authenticated 
USING (auth.uid() = profile_id);

-- Function to update store rating stats
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

-- Trigger for store_ratings
CREATE OR REPLACE TRIGGER on_store_rating_changed
AFTER INSERT OR UPDATE OR DELETE ON public.store_ratings
FOR EACH ROW EXECUTE FUNCTION public.update_store_rating_stats();

-- Function to update product rating stats
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

-- Trigger for product_ratings
CREATE OR REPLACE TRIGGER on_product_rating_changed
AFTER INSERT OR UPDATE OR DELETE ON public.product_ratings
FOR EACH ROW EXECUTE FUNCTION public.update_product_rating_stats();
