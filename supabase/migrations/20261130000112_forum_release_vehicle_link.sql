-- 20261130000112 — novidade 3.0.20 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.20', 'Link do motorista com o seu @',
       'O link da página do motorista agora é o seu @ com o modelo do carro, e a página mostra as avaliações das corridas.',
       ARRAY['Avaliações das corridas na página do motorista: a nota e o que os passageiros disseram'],
       ARRAY['Link do veículo no formato iuser.com.br/<seu @>-<modelo> (sem a placa); os links antigos continuam funcionando',
             'O que o carro tem ficou compacto, em ícones, embaixo do botão Chamar',
             'Chamar motorista: o trajeto vem primeiro e o app sempre pergunta de onde você sai (localização do aparelho ou digitar)'],
       ARRAY[]::text[],
       now() + interval '19 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.20');
