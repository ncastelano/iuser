-- 20261130000109 — novidade 3.0.18 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.18', 'Recorte a sua foto',
       'Ao trocar a foto do perfil ou o logo da loja, você escolhe a parte da imagem que aparece.',
       ARRAY['Recorte da foto do perfil e do logo da loja: arraste e aproxime antes de enviar (ou use sem recortar)'],
       ARRAY['Página da loja: a descrição de cada serviço voltou na linha do tempo',
             'Quando só há o botão Seguir, a nota e as visitas ficam ao lado dele',
             '"Denunciar loja" foi para o fim da página'],
       ARRAY[]::text[],
       now() + interval '17 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.18');
