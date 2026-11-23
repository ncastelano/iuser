-- 20261130000098 — novidade 3.0.10 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.10', 'Detalhes completos das corridas e entregas',
       'Ao abrir uma corrida ou entrega você vê tudo, como na corrida aceita, e o Painel mostra o seu cadastro inteiro.',
       ARRAY['O Outdoor dos motoristas agora fica no Painel'],
       ARRAY['Os detalhes da corrida/entrega já abrem com quem pediu, a nota, o trajeto completo, o mapa, os itens e os tempos',
             'O resumo de Meu cadastro mostra cada veículo, a tarifa inteira, a nota e as corridas feitas, sem cortar o texto',
             'A entrega em andamento abre na aba Entrega aceita, no mesmo lugar da corrida aceita'],
       ARRAY[]::text[],
       now() + interval '9 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.10');
