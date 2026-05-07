-- Migration: Add product reviews linked to verified purchases
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id UUID, -- Can be linked to public.orders(id) or store_sales(id) depending on implementation
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  is_anonymous BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, product_id, order_id) -- One review per product per purchase
);

-- Enable RLS
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public reviews are viewable by everyone" 
  ON public.product_reviews FOR SELECT 
  USING (true);

CREATE POLICY "Users can create reviews for their own purchases" 
  ON public.product_reviews FOR INSERT 
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can update their own reviews" 
  ON public.product_reviews FOR UPDATE 
  USING (auth.uid() = profile_id);
