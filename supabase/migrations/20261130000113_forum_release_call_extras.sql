-- 20261130000113 — novidade 3.0.21 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.21', 'Paradas e tarefas ao chamar um motorista',
       'Ao chamar um motorista você pode pôr até 2 paradas e pedir tarefas (pegar uma encomenda, levar alguém), cobradas pelo tempo.',
       ARRAY['Até 2 paradas no caminho: a rota e o valor já mudam',
             'Tarefas com o tempo estimado (5, 10, 15 ou 30 min), cobradas pelo valor por minuto do motorista (nunca abaixo do mínimo do iUser)'],
       ARRAY['O pagamento só aparece depois de escolher a partida e a chegada',
             '"Você está chamando" com o mesmo desenho da página do motorista (foto do carro e o motorista ao lado)',
             'Página do motorista: bolsas e malas por tamanho (P, M, G), como antes'],
       ARRAY[]::text[],
       now() + interval '20 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.21');
