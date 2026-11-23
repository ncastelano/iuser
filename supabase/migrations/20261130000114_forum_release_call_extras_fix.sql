-- 20261130000114 — acerta a novidade 3.0.21: as TAREFAS saíram; a parada fica entre a partida e a chegada e, com a corrida em andamento,
-- o passageiro "Solicita parada" (o motorista aprova e o tempo é somado). Só DADOS; reaplicável.
UPDATE public.forum_releases SET
  title = 'Paradas ao chamar um motorista',
  summary = 'Ao chamar um motorista você pode pôr até 2 paradas entre a partida e a chegada; com a corrida em andamento, é só tocar em Solicitar parada.',
  added = ARRAY['Até 2 paradas entre a partida e a chegada: o mapa mostra o caminho e o valor já muda',
                'Com a corrida em andamento: "Solicitar parada" — o motorista aprova e o tempo parado é somado'],
  improved = ARRAY['O pagamento só aparece depois de escolher a partida e a chegada',
                   '"Você está chamando" com o mesmo desenho da página do motorista (foto do carro e o motorista ao lado)',
                   'Página do motorista: bolsas e malas por tamanho (P, M, G), como antes',
                   'Pix da corrida: pague só no fim (paradas e esperas do caminho entram no valor)']
WHERE version = '3.0.21';
