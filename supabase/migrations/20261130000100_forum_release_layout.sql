-- 20261130000100 — novidade 3.0.12 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.12', 'Home mais enxuta',
       'Menos espaço vazio na home e o Fórum na ordem Novidades, Ideias e Tutorial.',
       ARRAY[]::text[],
       ARRAY['Fórum: Novidades, Ideias e Tutorial, nessa ordem (na home e na página)',
             'Cartões de "Lojas para conhecer" sem o espaço vazio no meio',
             'Flash sem posts vira uma linha baixa "Seja o primeiro: postar um flash", em vez de um cartão alto vazio'],
       ARRAY[]::text[],
       now() + interval '11 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.12');
