-- 20261130000063_review_photos.sql
--
-- AVALIAÇÃO RÁPIDA DA 3.0 (decisão do dono, 10/11/2026): o aviso de "avaliar" vira um cartão só, com as estrelas, o comentário e — na COMPRA
-- e no SERVIÇO — uma FOTO opcional. Corrida de motorista não tem foto.
--   · product_reviews.photo_path e appointment_reviews.photo_path: o CAMINHO no bucket público `posts` (nunca um link), SEMPRE na pasta de
--     quem avaliou (`<id>/...`) — o envio ao Storage já só é permitido nessa pasta (política storage_insert_own_folder da 20261106) e a
--     função `_review_photo_ok` confere de novo aqui (sem `..`, sem barra no começo, até 200 letras, extensão de imagem).
--   · submit_appointment_review ganha `p_photo` (DEFAULT NULL; chamadas antigas com 3 argumentos seguem iguais) e grava a foto nas duas
--     tabelas. O resto da função é o MESMO da 20261124000000.
-- Rollback: supabase/rollbacks/review_photos_rollback.sql

CREATE OR REPLACE FUNCTION public._review_photo_ok(p text, p_owner uuid) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    SELECT p IS NULL OR (
        p_owner IS NOT NULL
        AND length(p) <= 200
        AND p LIKE p_owner::text || '/%'
        AND position('..' in p) = 0
        AND p ~* '\.(jpe?g|png|webp|gif|avif)$'
    )
$$;

ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS photo_path text;
ALTER TABLE public.appointment_reviews ADD COLUMN IF NOT EXISTS photo_path text;
ALTER TABLE public.product_reviews DROP CONSTRAINT IF EXISTS product_reviews_photo_ok;
ALTER TABLE public.product_reviews ADD CONSTRAINT product_reviews_photo_ok CHECK (public._review_photo_ok(photo_path, profile_id));
ALTER TABLE public.appointment_reviews DROP CONSTRAINT IF EXISTS appointment_reviews_photo_ok;
ALTER TABLE public.appointment_reviews ADD CONSTRAINT appointment_reviews_photo_ok CHECK (public._review_photo_ok(photo_path, reviewer_id));

DROP FUNCTION IF EXISTS public.submit_appointment_review(uuid, integer, text);

CREATE OR REPLACE FUNCTION public.submit_appointment_review(p_appointment uuid, p_rating integer, p_comment text DEFAULT NULL::text, p_photo text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user uuid := auth.uid(); a public.appointments; v_owner uuid; v_service uuid; v_comment text := left(NULLIF(btrim(COALESCE(p_comment, '')), ''), 500); v_photo text := NULLIF(btrim(COALESCE(p_photo, '')), '');
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Escolha de 1 a 5 estrelas'; END IF;
    IF NOT public._review_photo_ok(v_photo, v_user) THEN RAISE EXCEPTION 'Foto inválida' USING HINT = 'review_photo_invalid'; END IF;
    SELECT * INTO a FROM public.appointments WHERE id = p_appointment;
    IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado'; END IF;
    v_owner := public._appointment_service_owner(a);
    IF v_owner IS NULL OR v_owner = a.customer_id THEN RAISE EXCEPTION 'Esse compromisso não é um serviço'; END IF;
    IF a.status <> 'completed' THEN RAISE EXCEPTION 'O serviço ainda não foi finalizado'; END IF;
    v_service := public._appointment_service_id(a);

    IF v_user = a.customer_id THEN
        INSERT INTO public.appointment_reviews (appointment_id, kind, reviewer_id, reviewee_id, store_id, service_id, service_name, rating, comment, photo_path)
        VALUES (a.id, 'service', v_user, v_owner, a.store_id, v_service, a.service_name, p_rating, v_comment, v_photo)
        ON CONFLICT (appointment_id, kind) DO NOTHING;
        IF NOT FOUND THEN RAISE EXCEPTION 'Você já avaliou esse serviço'; END IF;
        -- vai para as avaliações do serviço (públicas)
        IF v_service IS NOT NULL THEN
            INSERT INTO public.product_reviews (store_id, product_id, profile_id, rating, comment, is_anonymous, photo_path)
            VALUES (a.store_id, v_service, v_user, p_rating, v_comment, false, v_photo);
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

REVOKE ALL ON FUNCTION public.submit_appointment_review(uuid, integer, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_appointment_review(uuid, integer, text, text) TO authenticated;
