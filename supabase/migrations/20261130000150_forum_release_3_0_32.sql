-- 20261130000150 — novidade 3.0.32 no Fórum (só DADOS; reaplicável). Avisos e ofertas.
-- Rollback: supabase/rollbacks/forum_release_3_0_32_rollback.sql
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.32', 'Avisos e ofertas',
       'Lojas e o iUser podem mandar avisos na barra do aparelho, para quem escolheu receber ofertas.',
       ARRAY['Interruptor "Ofertas e promoções" na página de novidades (começa desligado)',
             'Lojas podem mandar um aviso por dia para quem segue ou já comprou da loja',
             'Avisos levam direto à publicação, ao produto ou à loja'],
       ARRAY['Quem desligar Ofertas deixa de receber os avisos de lojas, e as novidades continuam separadas'],
       ARRAY[]::text[],
       now() + interval '1 second'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.32');
