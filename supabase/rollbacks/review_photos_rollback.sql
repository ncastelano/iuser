-- Desfaz 20261130000063_review_photos.sql (as fotos das avaliações deixam de aparecer; os arquivos continuam no bucket posts)
DROP FUNCTION IF EXISTS public.submit_appointment_review(uuid, integer, text, text);

CREATE OR REPLACE FUNCTION public.submit_appointment_review(p_appointment uuid, p_rating integer, p_comment text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user uuid := auth.uid(); a public.appointments; v_owner uuid; v_service uuid; v_comment text := left(NULLIF(btrim(COALESCE(p_comment, '')), ''), 500);
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Escolha de 1 a 5 estrelas'; END IF;
    SELECT * INTO a FROM public.appointments WHERE id = p_appointment;
    IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado'; END IF;
    v_owner := public._appointment_service_owner(a);
    IF v_owner IS NULL OR v_owner = a.customer_id THEN RAISE EXCEPTION 'Esse compromisso não é um serviço'; END IF;
    IF a.status <> 'completed' THEN RAISE EXCEPTION 'O serviço ainda não foi finalizado'; END IF;
    v_service := public._appointment_service_id(a);

    IF v_user = a.customer_id THEN
        INSERT INTO public.appointment_reviews (appointment_id, kind, reviewer_id, reviewee_id, store_id, service_id, service_name, rating, comment)
        VALUES (a.id, 'service', v_user, v_owner, a.store_id, v_service, a.service_name, p_rating, v_comment)
        ON CONFLICT (appointment_id, kind) DO NOTHING;
        IF NOT FOUND THEN RAISE EXCEPTION 'Você já avaliou esse serviço'; END IF;
        -- vai para as avaliações do serviço (públicas)
        IF v_service IS NOT NULL THEN
            INSERT INTO public.product_reviews (store_id, product_id, profile_id, rating, comment, is_anonymous)
            VALUES (a.store_id, v_service, v_user, p_rating, v_comment, false);
        END IF;
    ELSIF v_user = v_owner THEN
        INSERT INTO public.appointment_reviews (appointment_id, kind, reviewer_id, reviewee_id, store_id, service_id, service_name, rating, comment)
        VALUES (a.id, 'client', v_user, a.customer_id, a.store_id, v_service, a.service_name, p_rating, v_comment)
        ON CONFLICT (appointment_id, kind) DO NOTHING;
        IF NOT FOUND THEN RAISE EXCEPTION 'Você já avaliou esse cliente'; END IF;
    ELSE
        RAISE EXCEPTION 'Só quem participa do serviço pode avaliar';
    END IF;
    RETURN true;
END; $function$;

REVOKE ALL ON FUNCTION public.submit_appointment_review(uuid, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_appointment_review(uuid, integer, text) TO authenticated;

ALTER TABLE public.product_reviews DROP CONSTRAINT IF EXISTS product_reviews_photo_ok;
ALTER TABLE public.appointment_reviews DROP CONSTRAINT IF EXISTS appointment_reviews_photo_ok;
ALTER TABLE public.product_reviews DROP COLUMN IF EXISTS photo_path;
ALTER TABLE public.appointment_reviews DROP COLUMN IF EXISTS photo_path;
DROP FUNCTION IF EXISTS public._review_photo_ok(text, uuid);
