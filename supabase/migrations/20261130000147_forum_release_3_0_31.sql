-- 20261130000147 — novidade 3.0.31 no Fórum (só DADOS; reaplicável). Avisos de novidade na barra do aparelho.
-- Rollback: supabase/rollbacks/forum_release_3_0_31_rollback.sql
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.31', 'Avisos de novidade na barra do aparelho',
       'Agora você fica sabendo das novidades do iUser pela barra do celular, mesmo com o app fechado, se quiser.',
       ARRAY['Interruptor "Avisar fora do iUser" na página de novidades',
             'Ao tocar no aviso, você cai direto nesta página de novidades'],
       ARRAY['Cada pessoa escolhe se quer receber os avisos de novidade'],
       ARRAY[]::text[],
       now() + interval '1 second'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.31');
