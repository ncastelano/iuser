-- 20261130000096_forum_release_canal2.sql — novidade 3.0.9 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.9', 'Canal do Motorista arrumado',
       'O Canal do Motorista ficou em três abas claras, sem nada repetido, e a foto de quem convida voltou na página de convite.',
       ARRAY['Aba Meu cadastro: veículo, tarifa e avaliações juntos, com atalhos para cada parte'],
       ARRAY['Abas: Painel · Corridas e entregas · Meu cadastro (Corrida aceita e Me candidatei só quando existem)',
             'O Painel abre primeiro, com o seu veículo, o modo motorista, o que está acontecendo agora e um resumo do cadastro',
             'A página de convite mostra a foto de quem convidou'],
       ARRAY['A aba Canal para quem já entrou: ela repetia a lista de Corridas e entregas',
             'A grade de 8 atalhos do Painel, que repetia as abas',
             'Os números de corridas repetidos no cartão do modo motorista'],
       now() + interval '8 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.9');
