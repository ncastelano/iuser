-- =====================================================================
-- AVISO DE NOVIDADE NA BARRA DO APARELHO (push) — 28/11/2026
--
-- · update_notification_prefs: cada pessoa liga/desliga as novidades (padrão: LIGADO). Sem acesso direto: só pelas funções.
-- · update_announcement_queue: quem vai receber o aviso de cada versão. Enfileirado pelo admin; cada linha é reivindicada
--   ANTES do envio (sent_at), então apertar o botão duas vezes nunca manda duas vezes.
-- · forum_releases.announced_at: quando o aviso da versão foi disparado (o admin vê e não dispara sem querer de novo).
-- · Quem recebe: quem tem aparelho com notificação ligada (navegador ou app) e NÃO desligou as novidades.
-- Rollback: supabase/rollbacks/update_announcements_rollback.sql
-- =====================================================================

ALTER TABLE public.forum_releases ADD COLUMN IF NOT EXISTS announced_at timestamptz;

CREATE TABLE IF NOT EXISTS public.update_notification_prefs (
    profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.update_notification_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.update_notification_prefs FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.update_announcement_queue (
    release_id uuid NOT NULL REFERENCES public.forum_releases(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sent_at timestamptz,
    PRIMARY KEY (release_id, profile_id)
);
CREATE INDEX IF NOT EXISTS update_announcement_queue_pending_idx ON public.update_announcement_queue (release_id) WHERE sent_at IS NULL;
ALTER TABLE public.update_announcement_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.update_announcement_queue FROM anon, authenticated;

-- a pessoa lê o próprio interruptor (padrão: ligado)
CREATE OR REPLACE FUNCTION public.get_update_notifications()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT coalesce((SELECT enabled FROM public.update_notification_prefs WHERE profile_id = auth.uid()), true)
$$;
REVOKE ALL ON FUNCTION public.get_update_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_update_notifications() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_update_notifications(p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.update_notification_prefs (profile_id, enabled, updated_at) VALUES (v_me, coalesce(p_enabled, true), now())
    ON CONFLICT (profile_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();
    RETURN coalesce(p_enabled, true);
END $$;
REVOKE ALL ON FUNCTION public.set_update_notifications(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_update_notifications(boolean) TO authenticated;

-- quem tem aparelho com notificação e não desligou as novidades (só do servidor)
CREATE OR REPLACE FUNCTION public._update_announce_targets()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT DISTINCT d.user_id FROM (
        SELECT user_id FROM public.push_subscriptions
        UNION
        SELECT user_id FROM public.native_push_tokens WHERE platform = 'android'
    ) d
    JOIN public.profiles p ON p.id = d.user_id AND p.is_blocked IS NOT TRUE
    WHERE NOT EXISTS (SELECT 1 FROM public.update_notification_prefs x WHERE x.profile_id = d.user_id AND x.enabled = false)
$$;
REVOKE ALL ON FUNCTION public._update_announce_targets() FROM PUBLIC, anon, authenticated;

-- o admin enfileira a versão (idempotente: quem já está na fila não entra de novo)
CREATE OR REPLACE FUNCTION public.admin_forum_announce(p_release uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pending integer;
BEGIN
    IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Só o serviço.' USING ERRCODE = '42501'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE id = p_release) THEN
        RAISE EXCEPTION 'Novidade não encontrada.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.update_announcement_queue (release_id, profile_id)
    SELECT p_release, t FROM public._update_announce_targets() t
    ON CONFLICT (release_id, profile_id) DO NOTHING;
    UPDATE public.forum_releases SET announced_at = coalesce(announced_at, now()) WHERE id = p_release;
    SELECT count(*) INTO v_pending FROM public.update_announcement_queue WHERE release_id = p_release AND sent_at IS NULL;
    RETURN v_pending;
END $$;
REVOKE ALL ON FUNCTION public.admin_forum_announce(uuid) FROM PUBLIC, anon, authenticated;

-- pega o próximo lote (marca antes de enviar) e deixa de fora quem desligou as novidades desde então
CREATE OR REPLACE FUNCTION public.admin_forum_announce_claim(p_release uuid, p_limit integer)
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Só o serviço.' USING ERRCODE = '42501'; END IF;
    RETURN QUERY
    WITH next AS (
        SELECT q.profile_id FROM public.update_announcement_queue q
         WHERE q.release_id = p_release AND q.sent_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM public.update_notification_prefs x WHERE x.profile_id = q.profile_id AND x.enabled = false)
         ORDER BY q.profile_id
         LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
         FOR UPDATE SKIP LOCKED
    )
    UPDATE public.update_announcement_queue q SET sent_at = now()
      FROM next WHERE q.release_id = p_release AND q.profile_id = next.profile_id
    RETURNING q.profile_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_forum_announce_claim(uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_forum_announce_remaining(p_release uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT count(*)::integer FROM public.update_announcement_queue WHERE release_id = p_release AND sent_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.admin_forum_announce_remaining(uuid) FROM PUBLIC, anon, authenticated;
