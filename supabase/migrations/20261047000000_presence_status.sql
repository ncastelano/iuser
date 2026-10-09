-- Status de presença escolhido pela pessoa:
--   'auto'    = fica online quando está no app e offline quando sai (padrão)
--   'online'  = mantém online mesmo com a aba em segundo plano (o app continua avisando)
--   'offline' = aparece offline mesmo com o app aberto (não registra que esteve online)
-- Quem pode ver continua sendo a escolha de "Visto por último" (todos / quem a pessoa segue / ninguém).
ALTER TABLE public.profile_presence ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'auto';
ALTER TABLE public.profile_presence ADD COLUMN IF NOT EXISTS online boolean NOT NULL DEFAULT false;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profile_presence_mode_check') THEN
        ALTER TABLE public.profile_presence ADD CONSTRAINT profile_presence_mode_check CHECK (mode IN ('auto', 'online', 'offline'));
    END IF;
END $$;

DROP FUNCTION IF EXISTS public.touch_last_seen();
CREATE OR REPLACE FUNCTION public.touch_last_seen(p_online boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mode text;
BEGIN
    IF auth.uid() IS NULL THEN RETURN; END IF;
    INSERT INTO public.profile_presence (profile_id) VALUES (auth.uid()) ON CONFLICT (profile_id) DO NOTHING;
    SELECT mode INTO v_mode FROM public.profile_presence WHERE profile_id = auth.uid();

    IF v_mode = 'offline' THEN
        UPDATE public.profile_presence SET online = false WHERE profile_id = auth.uid() AND online;
        RETURN;                                       -- invisível: não registra que esteve online
    END IF;
    IF v_mode = 'online' THEN p_online := true; END IF;   -- "sempre online" ignora o aviso de saída

    UPDATE public.profile_presence
       SET last_seen_at = now(), online = p_online
     WHERE profile_id = auth.uid()
       AND (online IS DISTINCT FROM p_online OR last_seen_at IS NULL OR last_seen_at < now() - interval '45 seconds');
END; $$;
REVOKE ALL ON FUNCTION public.touch_last_seen(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_seen(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_presence_mode(p_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    IF p_mode NOT IN ('auto', 'online', 'offline') THEN RAISE EXCEPTION 'Opção inválida'; END IF;
    INSERT INTO public.profile_presence (profile_id, mode, online, last_seen_at) VALUES (auth.uid(), p_mode, p_mode = 'online', CASE WHEN p_mode = 'offline' THEN NULL ELSE now() END)
    ON CONFLICT (profile_id) DO UPDATE
        SET mode = EXCLUDED.mode,
            online = (EXCLUDED.mode = 'online') OR (EXCLUDED.mode = 'auto' AND public.profile_presence.online),
            last_seen_at = CASE WHEN EXCLUDED.mode = 'offline' THEN public.profile_presence.last_seen_at ELSE now() END;
END; $$;
REVOKE ALL ON FUNCTION public.set_presence_mode(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_presence_mode(text) TO authenticated;

DROP FUNCTION IF EXISTS public.get_last_seen_for(uuid[]);
CREATE FUNCTION public.get_last_seen_for(p_ids uuid[])
RETURNS TABLE(profile_id uuid, last_seen_at timestamptz, online boolean, appears_offline boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT pr.profile_id,
           pr.last_seen_at,
           (pr.mode <> 'offline' AND pr.online AND pr.last_seen_at > now() - interval '150 seconds') AS online,
           (pr.mode = 'offline') AS appears_offline
    FROM public.profile_presence pr
    WHERE pr.profile_id = ANY (p_ids[1:200])
      AND (pr.last_seen_at IS NOT NULL OR pr.mode = 'offline')
      AND (
          pr.profile_id = auth.uid()
          OR pr.visibility = 'all'
          OR (pr.visibility = 'following' AND auth.uid() IS NOT NULL
              AND EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = pr.profile_id AND f.following_id = auth.uid()))
      );
$$;
REVOKE ALL ON FUNCTION public.get_last_seen_for(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_last_seen_for(uuid[]) TO anon, authenticated, service_role;
