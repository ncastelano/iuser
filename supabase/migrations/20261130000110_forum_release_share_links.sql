-- 20261130000110 — novidade 3.0.19 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.19', 'Links com a cara de cada página',
       'Ao compartilhar no WhatsApp, cada link mostra o que ele é: o perfil com a foto, o produto, o serviço, o cadastro.',
       ARRAY['Link iuser.com.br/cadastro leva ao cadastro e mostra "Crie sua conta grátis no iUser"',
             'Recorte da foto também ao escolher a foto no cadastro e ao criar a loja'],
       ARRAY['Prévia do perfil, do produto e do serviço volta a mostrar a foto (antes saía o logo do iUser)',
             'A prévia diz se o link é um Produto, Serviço, Conteúdo digital ou Publicação, e de quem',
             'Painel do perfil carrega com o esqueleto da página, sem a rodinha'],
       ARRAY[]::text[],
       now() + interval '18 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.19');
