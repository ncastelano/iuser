-- 20261130000144 — novidade 3.0.29 no Fórum (só DADOS; reaplicável). Conversas: visualização única e compartilhar.
-- Rollback: supabase/rollbacks/forum_release_3_0_29_rollback.sql
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.29', 'Conversas: visualização única e compartilhar',
       'A visualização única ficou certa em grupo e não se perde se a mídia não abrir. Compartilhar pede confirmação.',
       ARRAY['Enviar um link pelo diálogo de compartilhar pede confirmação (toque de novo para enviar)'],
       ARRAY['Visualização única: cada pessoa do grupo abre a sua, uma vez',
             'Se a foto ou o vídeo de visualização única não abrir, a conversa avisa em vez de sumir sem explicação'],
       ARRAY[]::text[],
       now() + interval '1 second'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.29');
