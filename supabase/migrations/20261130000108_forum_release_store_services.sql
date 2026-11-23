-- 20261130000108 — novidade 3.0.17 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.17', 'Página da loja mais enxuta',
       'Lojas de atendimento (clínicas, consultórios, salões) ficaram mais limpas: serviços em linha do tempo e horários só depois de escolher o dia.',
       ARRAY['Tocar no logo da loja abre a imagem grande'],
       ARRAY['Serviços aparecem como uma linha do tempo compacta, com duração, valor e Agendar',
             'Os horários livres só aparecem depois de você escolher o dia',
             'Nota, visitas, seguidores e endereço quebram de linha, sem rolar de lado',
             'Botão Seguir menor'],
       ARRAY['A aba Produtos (ou Serviços) quando a loja não tem nenhum'],
       now() + interval '16 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.17');
