-- Os convites que já tinham pontuado (a 50) passam a valer o peso atual da regra "Convidar alguém" (200),
-- e o total de cada perfil é refeito a partir do livro-caixa.
UPDATE public.profile_points_events e
SET points = r.points
FROM public.point_rules r
WHERE r.action = 'invite_signup' AND e.action = 'invite_signup' AND e.points <> r.points;

UPDATE public.profile_points pp
SET total = COALESCE(s.total, 0), updated_at = now()
FROM (
    SELECT profile_id, sum(points)::integer AS total FROM public.profile_points_events GROUP BY profile_id
) s
WHERE s.profile_id = pp.profile_id AND pp.total IS DISTINCT FROM s.total;
