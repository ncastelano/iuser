-- Cenários do tipo do perfil (migration 20261130000071). Transação DESFEITA: só LOCAL/staging.
BEGIN;
DO $$
DECLARE v_me uuid; v_other uuid; v_n int;
BEGIN
    SELECT id INTO v_me FROM public.profiles ORDER BY created_at LIMIT 1;
    SELECT id INTO v_other FROM public.profiles WHERE id <> v_me ORDER BY created_at LIMIT 1;
    -- 1) só os quatro tipos
    BEGIN
        UPDATE public.profiles SET profile_type = 'qualquer' WHERE id = v_me;
        ASSERT false, '1: tipo inválido deveria falhar';
    EXCEPTION WHEN check_violation THEN NULL; END;
    -- 2) a própria pessoa troca; a de outra, não (RLS de sempre)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_me, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.profiles SET profile_type = 'agendamentos' WHERE id = v_me;
    UPDATE public.profiles SET profile_type = 'motorista' WHERE id = v_other;
    RESET ROLE;
    ASSERT (SELECT profile_type FROM public.profiles WHERE id = v_me) = 'agendamentos', '2a: a própria troca';
    ASSERT (SELECT profile_type FROM public.profiles WHERE id = v_other) <> 'motorista' OR EXISTS (SELECT 1 FROM public.driver_vehicles WHERE driver_id = v_other), '2b: a de outra pessoa não muda';
    -- 3) visitante lê o tipo (é da página pública)
    SET LOCAL ROLE anon;
    SELECT count(*) INTO v_n FROM public.profiles WHERE id = v_me AND profile_type = 'agendamentos';
    RESET ROLE;
    ASSERT v_n = 1, '3: visitante lê o tipo';
    RAISE NOTICE 'profile_type: todos os cenários passaram';
END $$;
ROLLBACK;
