-- Curtidas nas avaliações de produto/serviço (usadas para mostrar primeiro as avaliações mais curtidas).
-- Privilégio mínimo desde o começo: qualquer pessoa LÊ (o contador é público, como nos comentários); só quem está logado curte e
-- só descurte a própria curtida; ninguém curte a própria avaliação. O schema `public` concede tudo a anon/authenticated por padrão,
-- então revogamos antes de liberar o necessário (não copie as concessões antigas de `comment_likes`, que são largas demais).

CREATE TABLE IF NOT EXISTS public.product_review_likes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id  uuid NOT NULL REFERENCES public.product_reviews(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (review_id, profile_id)
);
CREATE INDEX IF NOT EXISTS product_review_likes_review_idx ON public.product_review_likes (review_id);

ALTER TABLE public.product_review_likes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_review_likes FROM anon, authenticated;
GRANT SELECT ON public.product_review_likes TO anon, authenticated;
GRANT INSERT, DELETE ON public.product_review_likes TO authenticated;

DROP POLICY IF EXISTS product_review_likes_select ON public.product_review_likes;
CREATE POLICY product_review_likes_select ON public.product_review_likes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS product_review_likes_insert ON public.product_review_likes;
CREATE POLICY product_review_likes_insert ON public.product_review_likes FOR INSERT TO authenticated
    WITH CHECK (
        profile_id = auth.uid()
        AND NOT EXISTS (SELECT 1 FROM public.product_reviews r WHERE r.id = review_id AND r.profile_id = auth.uid())
    );

DROP POLICY IF EXISTS product_review_likes_delete ON public.product_review_likes;
CREATE POLICY product_review_likes_delete ON public.product_review_likes FOR DELETE TO authenticated
    USING (profile_id = auth.uid());
