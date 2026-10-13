-- Foto das comunidades de lugar:
--  (1) comunidade SEM foto ainda: a foto proposta mais cedo vence a rodada mesmo com 0 votos (não há nada a preservar).
--      Com foto atual, continua precisando de pelo menos 1 voto pra trocar.
--  (2) as rodadas passam a fechar sozinhas (pg_cron), em vez de esperar alguém abrir a sala depois da meia-noite.

CREATE OR REPLACE FUNCTION public._community_close_rounds(p_community uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today date := public._community_today(p_community); d record; w record; v_current text;
BEGIN
    FOR d IN
        SELECT DISTINCT round_day FROM public.community_photo_candidates
        WHERE community_id = p_community AND outcome IS NULL AND round_day < v_today
        ORDER BY round_day
    LOOP
        SELECT cand.id, cand.image_url, count(v.voter_id) AS votes INTO w
        FROM public.community_photo_candidates cand
        LEFT JOIN public.community_photo_votes v ON v.candidate_id = cand.id
        WHERE cand.community_id = p_community AND cand.round_day = d.round_day
        GROUP BY cand.id, cand.image_url, cand.created_at
        ORDER BY count(v.voter_id) DESC, cand.created_at ASC
        LIMIT 1;

        SELECT image_url INTO v_current FROM public.communities WHERE id = p_community;

        UPDATE public.community_photo_candidates SET outcome = 'lost'
        WHERE community_id = p_community AND round_day = d.round_day AND outcome IS NULL;
        IF w.id IS NOT NULL AND (w.votes > 0 OR v_current IS NULL) THEN
            UPDATE public.community_photo_candidates SET outcome = 'winner' WHERE id = w.id;
            UPDATE public.communities SET image_url = w.image_url WHERE id = p_community;
        END IF;
    END LOOP;
END; $$;

-- Fecha o que já passou da meia-noite (do fuso de cada comunidade) em todas as comunidades
CREATE OR REPLACE FUNCTION public.close_all_community_rounds()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; n integer := 0;
BEGIN
    FOR c IN
        SELECT DISTINCT cand.community_id
        FROM public.community_photo_candidates cand
        WHERE cand.outcome IS NULL AND cand.round_day < public._community_today(cand.community_id)
    LOOP
        PERFORM public._community_close_rounds(c.community_id);
        n := n + 1;
    END LOOP;
    RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.close_all_community_rounds() FROM public, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- A cada 10 minutos (cobre a virada do dia de qualquer fuso brasileiro com atraso de poucos minutos)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'community-photo-close-rounds';
SELECT cron.schedule('community-photo-close-rounds', '*/10 * * * *', $job$SELECT public.close_all_community_rounds()$job$);

-- Aplica agora o que ficou parado (ex.: a proposta de 09/10 em Porto Velho)
SELECT public.close_all_community_rounds();
