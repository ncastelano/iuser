-- 20261130000117 — novidade 3.0.23 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.23', 'Loja privada',
       'A loja pode ficar privada: só quem ela aprovar vê o que ela oferece, e a entrada é pelo link.',
       ARRAY['Loja privada (Editar loja → Quem pode ver a loja): some das listas e da busca; quem abre o link só pode pedir para ser cliente',
             'A loja aceita ou recusa os pedidos e pode remover clientes; quem já comprou ou agendou é aprovado sozinho',
             'Avisos no celular quando alguém pede para ser cliente e quando a loja aceita; o link, o Clube, os cartões no chat e os digitais de uma loja privada não aparecem para quem não é cliente'],
       ARRAY[]::text[],
       ARRAY[]::text[],
       now() + interval '22 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.23');
