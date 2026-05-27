-- Create mural_posts table for social features
CREATE TABLE IF NOT EXISTS public.mural_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.mural_posts ENABLE ROW LEVEL SECURITY;

-- Policies for mural_posts
CREATE POLICY "Mural posts are viewable by everyone" 
ON public.mural_posts FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can post to mural" 
ON public.mural_posts FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can delete their own mural posts" 
ON public.mural_posts FOR DELETE TO authenticated 
USING (auth.uid() = profile_id);
