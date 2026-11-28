-- 20261130000142 — novidade 3.0.28 no Fórum (só DADOS; reaplicável). Ações de mensagem nas conversas.
-- Rollback: supabase/rollbacks/forum_release_3_0_28_rollback.sql
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.28', 'Ações de mensagem nas conversas',
       'As conversas ganharam o que o WhatsApp tem no dia a dia: responder, reagir, editar, apagar, ver quem leu e buscar.',
       ARRAY['Responder uma mensagem citando o que foi dito (toque e segure a mensagem)',
             'Reagir com 👍 ❤️ 😂 😮 😢 🙏',
             'Editar a mensagem até 15 minutos depois de enviar',
             'Apagar para você ou apagar para todos (até 48 horas depois)',
             'Ver ✓ enviada e ✓✓ azul quando a outra pessoa leu, e "digitando…" no topo',
             'Buscar dentro da conversa (lupa no topo)'],
       ARRAY['Mensagem apagada aparece como "Mensagem apagada", sem foto nem texto',
             'Foto, vídeo e áudio aparecem uma vez só na conversa'],
       ARRAY[]::text[],
       now() + interval '1 second'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.28');
