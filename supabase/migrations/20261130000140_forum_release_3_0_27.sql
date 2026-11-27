-- 20261130000140 — novidade 3.0.27 no Fórum (só DADOS; reaplicável). Vídeo e áudio nas conversas.
-- Rollback: supabase/rollbacks/forum_release_3_0_27_rollback.sql
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.27', 'Vídeo e áudio nas conversas',
       'Nas conversas dá para mandar vídeo e gravar áudio, como no WhatsApp, e tudo pode ser de visualização única.',
       ARRAY['Vídeo de até 1 minuto nas conversas (também de visualização única)',
             'Áudio gravado pelo microfone do lado de enviar, com o play como no WhatsApp (também de visualização única)',
             'Ver uma vez: um botão no anexo que vale para foto, vídeo e áudio'],
       ARRAY['O botão + junta tudo o que dá para enviar, com nomes e ícones',
             'Foto, vídeo e áudio ficam guardados num lugar privado e só abrem para quem está na conversa'],
       ARRAY[]::text[],
       now() + interval '1 second'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.27');
