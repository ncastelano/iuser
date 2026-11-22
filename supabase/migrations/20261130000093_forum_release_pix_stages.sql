-- 20261130000093_forum_release_pix_stages.sql — novidade 3.0.6 no Fórum: as etapas do Pix no painel da loja (só DADOS; reaplicável).
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.6', 'O Pix no painel da loja, passo a passo',
       'Ficou claro em que pé está o Pix de cada pedido: esperando, avisado pelo cliente (com o comprovante) e recebido.',
       ARRAY['Botão "Recebi o Pix" direto no pedido em preparo: confirmou, aparece o "Pronto"',
             'Quando o cliente avisa que pagou ou manda o comprovante, o pedido pisca e o selo muda na hora'],
       ARRAY['O selo do pedido diz "Esperando Pix", "Pix avisado · conferir", "Comprovante no pedido · conferir" ou "Pix ✓"',
             'Nos pedidos ainda não aceitos o selo diz "Pix depois do aceite"'],
       ARRAY['O botão "Esperando Pix" (virou "Recebi o Pix")'],
       now() + interval '5 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.6');
