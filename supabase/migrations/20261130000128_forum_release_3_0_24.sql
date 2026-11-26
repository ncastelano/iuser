-- 20261130000128 — novidade 3.0.24 no Fórum (só DADOS; reaplicável). Reúne o que mudou desde a 3.0.23.
-- Rollback: supabase/rollbacks/forum_release_3_0_24_rollback.sql
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.24', 'Perfil do motorista, pedidos e carregamento mais claros',
       'O perfil do motorista ficou mais completo, a navbar mostra melhor os seus pedidos e as telas avisam quando estão carregando.',
       ARRAY['Perfil do motorista: a foto do carro aparece inteira, com o botão Ampliar foto (tela cheia, com zoom) para quem visita',
             'Dono do carro: botão Enquadrar para arrastar e dar zoom na foto que aparece no perfil',
             'Lojas da pessoa aparecem no perfil do motorista, como uma pequena propaganda',
             'Marca do veículo: o cadastro tem Marca, Modelo e Placa, e o nome do carro aparece como Marca Modelo',
             'Meus convidados no painel do perfil: quem entrou pelo seu link e a pontuação de cada um, sem precisar abrir outra página',
             'Coroas (ouro, prata e bronze) nos três primeiros do Outdoor iUser, em qualquer avatar',
             'Chamar um motorista: suas últimas corridas aparecem na partida, e você pode sugerir outro valor (que vira o valor inicial)',
             'Corrida chamada só para você aparece numa aba Privado, com o valor, na navbar',
             'Barra de progresso no topo acompanha o carregamento das telas (Canal do Motorista, Conversas, Itens, painel e Flash)',
             'Na navbar, o botão +N pedidos mostra um selo por status com a quantidade, e o ícone Itens mostra um selo por status'],
       ARRAY['A placa do veículo só aparece na tela da corrida aceita (sumiu do perfil, da prévia e do painel)',
             'Dirigindo agora aparece só com o modo motorista ligado e a posição recente',
             'A página de pedidos da loja fica sempre aberta, sem recolher',
             'A navbar destaca o pedido que mudou por último',
             'Total de tempo e de quilômetros no card da corrida',
             'Visitas da loja: o total de visitas da página e no painel está certo'],
       ARRAY['A aba Clientes na página do veículo (o histórico de corridas agora fica em Meu veículo)',
             'O pedido à IA do iUser na busca da home'],
       now() + interval '1 second'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.24');
