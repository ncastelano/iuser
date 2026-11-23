-- 20261130000103 — novidade 3.0.14 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.14', 'Uma corrida por vez',
       'O motorista com uma corrida em andamento não aceita outra, e o Outdoor mostra a borda que cada pessoa escolheu.',
       ARRAY['Motorista com corrida em andamento não consegue aceitar nem ser escolhido para outra corrida (entregas de loja continuam podendo ser juntadas, mas não durante uma corrida de passageiro)'],
       ARRAY['O Outdoor iUser e o Outdoor Motoristas mostram a borda que a pessoa escolheu',
             'A faixa do carrinho aparece em todas as páginas quando há itens'],
       ARRAY[]::text[],
       now() + interval '13 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.14');
