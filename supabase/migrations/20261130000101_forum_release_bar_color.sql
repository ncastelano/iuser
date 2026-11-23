-- 20261130000101 — novidade 3.0.13 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.13', 'A barra tem a cor do modo',
       'A barra de baixo ganhou o tom do modo em uso: azul para Pessoa, laranja para Loja e verde para Motorista.',
       ARRAY[]::text[],
       ARRAY['Barra de baixo com o fundo, a borda e a aba atual na cor do modo (Pessoa azul, Loja laranja, Motorista verde)',
             'O botão do modo mostra o nome e o anel da foto nessa mesma cor'],
       ARRAY[]::text[],
       now() + interval '12 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.13');
