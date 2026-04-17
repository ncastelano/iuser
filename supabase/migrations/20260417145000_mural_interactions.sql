-- Create mural_likes table
CREATE TABLE IF NOT EXISTS public.mural_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.mural_posts(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(post_id, profile_id)
);

-- Create mural_comments table
CREATE TABLE IF NOT EXISTS public.mural_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.mural_posts(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mural_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mural_comments ENABLE ROW LEVEL SECURITY;

-- Policies for mural_likes
CREATE POLICY "Mural likes viewable by everyone" ON public.mural_likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like posts" ON public.mural_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Users can unlike their own likes" ON public.mural_likes FOR DELETE TO authenticated USING (auth.uid() = profile_id);

-- Policies for mural_comments
CREATE POLICY "Mural comments viewable by everyone" ON public.mural_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment" ON public.mural_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Users can delete their own comments" ON public.mural_comments FOR DELETE TO authenticated USING (auth.uid() = profile_id);

-- Add a comment count and like count view or triggers if needed, but we can query directly for now.
