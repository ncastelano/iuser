-- Troca de avaliações em compras: se a LOJA quiser (stores.mutual_reviews), depois que o pedido é concluído ('paid')
-- ela avalia o cliente e os dois lados passam a ver a avaliação um do outro (a do cliente para a loja já existe
-- em product_reviews, ligada ao pedido por order_id).
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS mutual_reviews boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.customer_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,   -- dono da loja
    reviewee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,   -- cliente
    rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_reviews_reviewee_idx ON public.customer_reviews (reviewee_id);
ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;

-- Cliente e dono da loja leem; o público só lê quando a loja escolheu mostrar a troca de avaliações
DROP POLICY IF EXISTS "Ver avaliação do cliente" ON public.customer_reviews;
CREATE POLICY "Ver avaliação do cliente" ON public.customer_reviews FOR SELECT USING (
    reviewee_id = auth.uid() OR reviewer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.mutual_reviews)
);

CREATE OR REPLACE FUNCTION public.review_customer(p_order uuid, p_rating integer, p_comment text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); o public.orders; s public.stores; v_comment text := NULLIF(btrim(COALESCE(p_comment, '')), '');
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Escolha de 1 a 5 estrelas'; END IF;
    SELECT * INTO o FROM public.orders WHERE id = p_order;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
    SELECT * INTO s FROM public.stores WHERE id = o.store_id;
    IF s.owner_id <> v_user THEN RAISE EXCEPTION 'Só a loja do pedido pode avaliar o cliente'; END IF;
    IF NOT s.mutual_reviews THEN RAISE EXCEPTION 'A troca de avaliações está desligada nessa loja'; END IF;
    IF o.status <> 'paid' THEN RAISE EXCEPTION 'O pedido ainda não foi concluído'; END IF;
    IF o.buyer_id IS NULL THEN RAISE EXCEPTION 'Esse pedido não tem um cliente com conta'; END IF;

    INSERT INTO public.customer_reviews (order_id, store_id, reviewer_id, reviewee_id, rating, comment)
    VALUES (o.id, s.id, v_user, o.buyer_id, p_rating, left(v_comment, 500))
    ON CONFLICT (order_id) DO NOTHING;
    IF NOT FOUND THEN RAISE EXCEPTION 'Você já avaliou esse cliente'; END IF;

    BEGIN
        PERFORM public._notify(o.buyer_id, 'customer_review', v_user, o.id,
            jsonb_build_object('rating', p_rating, 'snippet', left(COALESCE(v_comment, ''), 120), 'title', s.name), 'custrev:' || o.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.review_customer(uuid, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.review_customer(uuid, integer, text) TO authenticated;

-- A situação da troca de avaliações de um pedido, pra quem participa dele (loja ou cliente)
CREATE OR REPLACE FUNCTION public.get_order_review_state(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); o public.orders; s public.stores; v_role text; cr public.customer_reviews; pr record;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO s FROM public.stores WHERE id = o.store_id;
    v_role := CASE WHEN s.owner_id = v_user THEN 'store' WHEN o.buyer_id = v_user THEN 'buyer' ELSE NULL END;
    IF v_role IS NULL THEN RETURN NULL; END IF;

    SELECT * INTO cr FROM public.customer_reviews WHERE order_id = o.id;
    SELECT rating, comment, is_anonymous INTO pr FROM public.product_reviews
    WHERE order_id = o.id AND store_id = s.id ORDER BY created_at DESC LIMIT 1;

    RETURN jsonb_build_object(
        'enabled', s.mutual_reviews,
        'role', v_role,
        'paid', o.status = 'paid',
        'store_name', s.name,
        'can_review', (v_role = 'store' AND s.mutual_reviews AND o.status = 'paid' AND o.buyer_id IS NOT NULL AND cr.id IS NULL),
        'store_review', CASE WHEN cr.id IS NULL THEN NULL
                             ELSE jsonb_build_object('rating', cr.rating, 'comment', cr.comment, 'created_at', cr.created_at) END,
        'buyer_review', CASE WHEN pr.rating IS NULL THEN NULL
                             ELSE jsonb_build_object('rating', pr.rating, 'comment', pr.comment) END
    );
END; $$;
REVOKE ALL ON FUNCTION public.get_order_review_state(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_order_review_state(uuid) TO authenticated;
