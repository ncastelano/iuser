-- 20261130000105 — novidade 3.0.15 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.15', 'Radar mais claro',
       'O Radar mostra se você está visível, a lista de cima ficou mais arrumada e os bairros do Social ganharam um mapinha.',
       ARRAY['Mapinha em cada bairro de "Locais com mais pessoas": tocar abre o Radar ali, no modo Pessoas',
             'A borda da sua foto no Radar mostra se você aparece no mapa: verde = visível, vermelho = não (pulsando)'],
       ARRAY['A lista do alto do Radar virou um painel com o filtro em cima e mais espaço entre os itens',
             'Todos os itens da lista mostram o número da colocação, em qualquer filtro (mais vistos, mais vendidos, Outdoor...)'],
       ARRAY['Os pontos na lista do alto do Radar (fica só a colocação)'],
       now() + interval '14 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.15');
