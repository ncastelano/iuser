-- 20261130000089_forum_release_itens2.sql
-- Novidade no Fórum (/forum → Novidades): a aba Itens ficou com DUAS partes, Carrinho e Itens. Só DADOS; reaplicável.
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.2', 'Itens: tudo o que é seu, num lugar só',
       'A aba Itens agora tem só duas partes: o Carrinho, com o que você vai comprar, e Itens, com tudo o que já é seu.',
       ARRAY['Em Itens você vê o que já tem, separado por tipo: Produtos que comprou, Digitais (cursos, músicas, livros, programas) e Serviços agendados',
             'Botão "De novo" para comprar outra vez um produto que você já comprou',
             'Aviso de pedido em andamento no alto de Itens, que leva direto ao Histórico'],
       ARRAY['O Histórico dos pedidos agora fica dentro de Itens'],
       ARRAY['A subaba separada "Histórico" (agora ela mora dentro de Itens)'],
       now() + interval '1 second'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.2');
