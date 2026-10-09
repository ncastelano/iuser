-- site_visits.anonymous_id é uuid: o gatilho de "visitou seu perfil" misturava com texto e quebraria o registro da visita.
CREATE OR REPLACE FUNCTION public.trg_notify_profile_view() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_visitor text;
BEGIN
    BEGIN
        IF NEW.path IS NULL OR NEW.path !~ '^/[^/?#]+$' THEN RETURN NEW; END IF;
        SELECT id INTO v_id FROM public.profiles WHERE "profileSlug" = substr(NEW.path, 2);
        IF v_id IS NULL THEN RETURN NEW; END IF;
        v_visitor := COALESCE(NEW.user_id::text, 'anon:' || COALESCE(NEW.anonymous_id::text, 'x'));
        PERFORM public._notify(v_id, 'profile_view', NEW.user_id, NULL, '{}'::jsonb,
            'view:' || v_visitor || ':' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD'));
    EXCEPTION WHEN OTHERS THEN
        -- Nada de notificação pode atrapalhar o registro da visita
        NULL;
    END;
    RETURN NEW;
END; $$;
