-- 20261130000097 — acerta o texto da novidade 3.0.9 (a aba Canal saiu para quem entrou). Só DADOS; reaplicável.
UPDATE public.forum_releases SET
  summary = 'O Canal do Motorista ficou em três abas claras, sem nada repetido, e a foto de quem convida voltou na página de convite.',
  improved = ARRAY['Abas: Painel · Corridas e entregas · Meu cadastro (Corrida aceita e Me candidatei só quando existem)',
                   'O Painel abre primeiro, com o seu veículo, o modo motorista, o que está acontecendo agora e um resumo do cadastro',
                   'A página de convite mostra a foto de quem convidou'],
  removed = ARRAY['A aba Canal para quem já entrou: ela repetia a lista de Corridas e entregas',
                  'A grade de 8 atalhos do Painel, que repetia as abas',
                  'Os números de corridas repetidos no cartão do modo motorista']
WHERE version = '3.0.9';
