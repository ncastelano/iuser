-- 20261130000088_forum_release_itens.sql
-- Novidade publicada no Fórum (/forum → Novidades): a aba "Atividade" virou "Itens". Só DADOS (uma linha em forum_releases); reaplicável.
-- Regra do dono (19/11/2026): toda mudança que a pessoa vê no app ganha uma novidade no Fórum.
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.1', 'Atividade agora se chama Itens',
       'A aba da barra de baixo que mostrava seus pedidos, carrinho e biblioteca ganhou nomes mais claros. Os endereços antigos continuam funcionando.',
       ARRAY['Aba "Como funciona" no Fórum: um guia completo do iUser, com passo a passo e busca'],
       ARRAY['A aba "Atividade" da barra agora se chama "Itens"',
             '"Pedidos" virou "Histórico": os pedidos em andamento e os que já terminaram',
             '"Biblioteca" virou "Itens": tudo o que é seu (cursos, músicas, livros e programas)',
             'Ícones novos: Itens é a caixa, Histórico é o relógio e Carrinho continua o carrinho',
             'O resumo do carrinho em cima da barra agora aparece também na aba Itens'],
       ARRAY[]::text[],
       now()
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.1');
