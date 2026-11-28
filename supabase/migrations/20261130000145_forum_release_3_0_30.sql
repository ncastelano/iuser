-- 20261130000145 — novidade 3.0.30 no Fórum (só DADOS; reaplicável). Mídia escolhida fica no cartão até enviar.
-- Rollback: supabase/rollbacks/forum_release_3_0_30_rollback.sql
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.30', 'Foto, vídeo e áudio: revisar antes de enviar',
       'Escolher uma foto, um vídeo ou gravar um áudio não envia de imediato: a mídia fica num cartão para você escrever uma legenda e enviar quando quiser.',
       ARRAY['Cartão de revisão acima da caixa: dá para ver ou ouvir antes de enviar',
             'Legenda opcional escrita na caixa de mensagem junto com a mídia',
             'Tirar do envio com o X, sem perder o que você já escreveu'],
       ARRAY['O "ver uma vez" pode ser ligado ou desligado no próprio cartão'],
       ARRAY[]::text[],
       now() + interval '1 second'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.30');
