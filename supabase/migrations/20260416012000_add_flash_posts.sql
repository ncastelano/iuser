-- Create flash_posts table
CREATE TABLE IF NOT EXISTS public.flash_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    type TEXT NOT NULL, -- 'new_product', 'price_change', 'manual'
    title TEXT,
    content TEXT,
    old_price NUMERIC(10,2),
    new_price NUMERIC(10,2),
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.flash_posts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Flash posts are public" ON public.flash_posts
    FOR SELECT USING (true);

CREATE POLICY "Owners can manage their flash posts" ON public.flash_posts
    FOR ALL USING (
        auth.uid() IN (
            SELECT owner_id FROM public.stores WHERE id = store_id
        )
    );

-- Create a view for flash posts with store information
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
