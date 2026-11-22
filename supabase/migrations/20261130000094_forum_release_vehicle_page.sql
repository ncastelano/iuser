-- 20261130000094_forum_release_vehicle_page.sql — novidade 3.0.7 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.7', 'Página do veículo de volta e painel do perfil mais limpo',
       'O motorista tem de novo a página do veículo para compartilhar, e o painel do perfil ficou mais rápido de ler.',
       ARRAY['Página do veículo (iuser.com.br/seu-veículo): o link para as pessoas chamarem você, com botão de compartilhar',
             'No alto do Canal do Motorista: se o modo motorista está ligado, o seu veículo e os atalhos Página do veículo, Compartilhar e Meu perfil',
             'Esqueleto do painel do perfil enquanto ele carrega'],
       ARRAY['Agenda recolhida mostra os agendamentos pendentes',
             'O tipo do perfil fica dentro de Informações do perfil e só aparece com ele aberto',
             'O cartão Convidados iUser tem as cores do cartão de Comissões'],
       ARRAY[]::text[],
       now() + interval '6 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.7');
