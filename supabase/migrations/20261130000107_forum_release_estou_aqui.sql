-- 20261130000107 — novidade 3.0.16 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.16', 'Estou aqui',
       'Chegou num bar, restaurante ou loja do iUser? O app pergunta se você está lá, e a loja mostra quem está aqui agora.',
       ARRAY['"Estou aqui": perto de uma loja do iUser o app pergunta "Você está na <loja>?"; dizendo sim, você aparece na página da loja por 3 horas',
             'Página da loja mostra "N pessoas aqui agora" com as fotos, e quem está pode tocar em "Saí daqui"'],
       ARRAY['Radar: o painel de cima ficou transparente, sem cobrir o mapa',
             'Radar: cada pessoa tem uma borda só (a que ela escolheu)',
             'Radar: vários no mesmo lugar aparecem como imagens empilhadas (2, 3, ou 3 e um +), no lugar do número'],
       ARRAY[]::text[],
       now() + interval '15 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.16');
