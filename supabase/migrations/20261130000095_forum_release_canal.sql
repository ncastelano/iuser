-- 20261130000095_forum_release_canal.sql — novidade 3.0.8 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.8', 'Canal do Motorista numa página só',
       'Veículo, tarifa e avaliações agora ficam dentro da aba Canal, e as solicitações mostram só as corridas.',
       ARRAY[]::text[],
       ARRAY['Aba Canal junta o seu veículo, a sua tarifa e as suas avaliações',
             'A aba "Solicitações de motorista" virou "Solicitações de corrida" e mostra só as corridas (as entregas das lojas ficam em Entregas)'],
       ARRAY['Os botões repetidos "painel do motorista" e "ver corridas" do alto do Canal',
             'As abas separadas Veículo, Tarifa e Avaliações'],
       now() + interval '7 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.8');
