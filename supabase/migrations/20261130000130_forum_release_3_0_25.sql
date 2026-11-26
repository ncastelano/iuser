-- 20261130000130 — novidade 3.0.25 no Fórum (só DADOS; reaplicável). Reúne o que mudou desde a 3.0.24.
-- Rollback: supabase/rollbacks/forum_release_3_0_25_rollback.sql
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.25', 'Lojas, painel e vendas mais organizados',
       'Vender produto pergunta em qual loja entra, o painel da loja ficou com tudo no mesmo lugar e cada pessoa tem 3 lojas sem pagar.',
       ARRAY['Cada pessoa pode ter até 3 lojas sem pagar; a partir da 4ª, cada loja custa R$ 50',
             'Produtos e serviços de loja têm dados para o Google (nome, foto e preço), e aparecem na busca'],
       ARRAY['Vender produto sempre pergunta em qual loja o produto entra (ou se é uma loja nova)',
             'O painel da loja tem a edição embaixo de Gerenciar a loja: não precisa mais abrir outra página',
             'Visitantes aparece antes de Avaliações e comentários, e Seu plano fica logo acima de Gerenciar a loja'],
       ARRAY['A página separada Editar loja (agora o endereço só leva ao painel)',
             'Os atalhos em grade de Gerenciar a loja (agora a lista de Editar loja mostra o estado de cada coisa)'],
       now() + interval '1 second'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.25');
