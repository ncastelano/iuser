-- O que está acontecendo nas comunidades (pra lista e a home): última mensagem e se tem votação de foto em andamento.
-- Só datas e miniaturas públicas — nada de conteúdo de mensagem nem contagem de votos.
CREATE OR REPLACE FUNCTION public.get_communities_activity(p_ids uuid[])
RETURNS TABLE (
    community_id uuid,
    last_message_at timestamptz,
    photo_vote_active boolean,
    photo_candidates integer,
    photo_event_at timestamptz,
    photo_thumbs text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT c.id,
           (SELECT max(m.created_at) FROM public.community_messages m WHERE m.community_id = c.id),
           COALESCE(ev.n, 0) > 0,
           COALESCE(ev.n, 0)::integer,
           ev.last_at,
           COALESCE(ev.thumbs, ARRAY[]::text[])
    FROM public.communities c
    LEFT JOIN LATERAL (
        SELECT count(*) AS n,
               max(cand.created_at) AS last_at,
               (array_agg(cand.image_url ORDER BY cand.created_at DESC))[1:3] AS thumbs
        FROM public.community_photo_candidates cand
        WHERE cand.community_id = c.id
          AND cand.outcome IS NULL
          AND cand.round_day = (now() AT TIME ZONE c.tz)::date
    ) ev ON true
    WHERE c.id = ANY(p_ids);
$$;
REVOKE ALL ON FUNCTION public.get_communities_activity(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_communities_activity(uuid[]) TO anon, authenticated;
