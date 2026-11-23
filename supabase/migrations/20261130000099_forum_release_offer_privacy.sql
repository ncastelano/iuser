-- 20261130000099 — novidade 3.0.11 no Fórum (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.11', 'Mais privacidade nos pedidos de corrida',
       'O motorista só vê quem pediu depois de ser escolhido, e cada tipo de pedido tem um card próprio.',
       ARRAY['Cards com cor e ícone por tipo: passageiro (laranja), entrega de loja (verde), objeto (azul) e animal (roxo), com a forma de pagamento'],
       ARRAY['Antes de ser escolhido, o motorista vê só "Passageiro" e a nota, ou o nome e o logo da loja na entrega',
             'Pedidos esquecidos somem da lista: corrida depois de 3 horas, entrega depois de 90 minutos'],
       ARRAY['O nome e a foto de quem pediu na lista de corridas abertas'],
       now() + interval '10 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.11');
