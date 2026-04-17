-- Create profile_views table to track visits to personal profiles
CREATE TABLE IF NOT EXISTS public.profile_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    visitor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

-- Policies for profile_views
CREATE POLICY "Profile views are viewable by the profile owner" 
ON public.profile_views FOR SELECT 
USING (auth.uid() = profile_id);

CREATE POLICY "Anyone can insert profile views" 
ON public.profile_views FOR INSERT 
WITH CHECK (true);

-- Fix store_sales policies to allow buyers to see their own purchases
DROP POLICY IF EXISTS "Buyers can view their own sales" ON public.store_sales;
CREATE POLICY "Buyers can view their own sales" ON public.store_sales 
FOR SELECT USING (auth.uid() = buyer_id);
