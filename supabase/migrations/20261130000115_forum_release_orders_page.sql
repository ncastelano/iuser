-- 20261130000115 — novidade 3.0.22 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.22', 'Pedidos da loja iguais ao painel',
       'A página Pedidos (da barra) agora é o mesmo funil do painel da loja, com todos os pedidos de cada etapa, e as fotos das comunidades voltaram.',
       ARRAY[]::text[],
       ARRAY['Pedidos da loja: o mesmo funil do painel (Novos, Em preparo, Prontos, A caminho), com todos os pedidos de cada etapa e o histórico embaixo',
             'A foto das comunidades volta a aparecer no Social e na home'],
       ARRAY[]::text[],
       now() + interval '21 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.22');
