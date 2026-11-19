-- Cenários do fórum (migration 20261130000087). Transação DESFEITA: só LOCAL/staging.
-- Rodar: docker exec -i -e PGPASSWORD supabase_db_iuser-local psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/tests/forum_scenarios.sql
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS $$
    SELECT set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', p::text, true)
$$;
DO $$
DECLARE a uuid; b uuid; v_idea uuid; j jsonb; v_c uuid; i int;
BEGIN
    SELECT id INTO a FROM public.profiles WHERE NOT COALESCE(is_blocked, false) ORDER BY created_at LIMIT 1;
    SELECT id INTO b FROM public.profiles WHERE id <> a AND NOT COALESCE(is_blocked, false) ORDER BY created_at LIMIT 1;
    PERFORM pg_temp.as_user(a);
    v_idea := public.forum_create_idea('Modo escuro automático', 'Seguir o tema do celular', 'geral');
    ASSERT (SELECT up_count FROM public.forum_ideas WHERE id = v_idea) = 1, '1: autor já vota';
    PERFORM pg_temp.as_user(b);
    j := public.forum_vote(v_idea, 1);  ASSERT (j->>'up')::int = 2, '2a: voto conta';
    j := public.forum_vote(v_idea, 1);  ASSERT (j->>'up')::int = 2, '2b: um voto por pessoa';
    j := public.forum_vote(v_idea, -1); ASSERT (j->>'up')::int = 1 AND (j->>'down')::int = 1, '2c: troca de voto';
    j := public.forum_vote(v_idea, 0);  ASSERT (j->>'down')::int = 0, '2d: tira o voto';
    v_c := public.forum_comment(v_idea, NULL, 'Boa ideia!');
    ASSERT (SELECT comment_count FROM public.forum_ideas WHERE id = v_idea) = 1, '3: comentário conta';
    PERFORM pg_temp.as_user(a);
    PERFORM public.forum_delete_comment(v_c);
    ASSERT EXISTS (SELECT 1 FROM public.forum_comments WHERE id = v_c), '4: não apaga o comentário dos outros';
    -- limite de 5 ideias por dia
    FOR i IN 1..4 LOOP PERFORM public.forum_create_idea('Ideia de teste ' || i, NULL, 'geral'); END LOOP;
    BEGIN PERFORM public.forum_create_idea('Mais uma ideia', NULL, 'geral'); ASSERT false, '5'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    -- admin esconde
    PERFORM public.admin_forum_idea(v_idea, 'planned', 'Vamos fazer', NULL, true, a);
    PERFORM pg_temp.as_user(b);
    BEGIN PERFORM public.forum_vote(v_idea, 1); ASSERT false, '6: escondida não recebe voto'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    ASSERT NOT has_table_privilege('authenticated', 'public.forum_ideas', 'INSERT'), '7a: sem insert direto';
    ASSERT NOT has_table_privilege('authenticated', 'public.forum_votes', 'UPDATE'), '7b';
    ASSERT NOT has_function_privilege('authenticated', 'public.admin_forum_idea(uuid, text, text, uuid, boolean, uuid)', 'EXECUTE'), '7c';
    ASSERT NOT has_function_privilege('anon', 'public.forum_vote(uuid, int)', 'EXECUTE'), '7d';
    RAISE NOTICE 'forum: TUDO CERTO';
END $$;
ROLLBACK;
