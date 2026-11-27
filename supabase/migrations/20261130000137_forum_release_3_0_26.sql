-- 20261130000137 — novidade 3.0.26 no Fórum (só DADOS; reaplicável). Conversas com link, foto, foto de visualização única e localização.
-- Rollback: supabase/rollbacks/forum_release_3_0_26_rollback.sql
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.26', 'Conversas com mais coisas',
       'Nas conversas agora dá para mandar foto, foto que só abre uma vez e a sua localização ao vivo, e os links aparecem com uma prévia.',
       ARRAY['Foto de visualização única: quem recebe abre uma vez, e depois ela some',
             'Localização ao vivo: você escolhe 15 minutos, 1 hora ou até desligar (no máximo 8 horas)',
             'Links de sites aparecem com título e imagem da página, como no WhatsApp'],
       ARRAY['O anexo ao lado da mensagem junta foto, foto de visualização única e localização',
             'Foto e localização que você mandou aparecem na conversa na hora, sem precisar recarregar'],
       ARRAY[]::text[],
       now() + interval '1 second'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.26');
