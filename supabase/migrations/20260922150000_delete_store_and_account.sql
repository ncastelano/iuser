-- Exclusão de loja e de conta. As tabelas filhas (pedidos, produtos,
-- seguidores etc.) nem todas têm ON DELETE CASCADE, então um DELETE simples
-- falharia por FK. Essas funções descobrem em runtime (pg_constraint) tudo
-- que referencia a linha e apagam de baixo pra cima. Só o service role
-- chama — as rotas /api/stores/delete e /api/account/delete conferem
-- senha e dono antes.
CREATE OR REPLACE FUNCTION public._purge_rows(
    p_table regclass, p_key_col text, p_vals text[], p_depth integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    fk record;
    parent_vals text[];
    child_pk text;
    child_vals text[];
BEGIN
    IF p_vals IS NULL OR coalesce(array_length(p_vals, 1), 0) = 0 THEN RETURN; END IF;
    IF p_depth > 10 THEN RAISE EXCEPTION 'Exclusão em cascata profunda demais em %', p_table; END IF;

    FOR fk IN
        SELECT c.conrelid::regclass AS child, a.attname AS child_col, ra.attname AS parent_col
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
        WHERE c.contype = 'f'
          AND c.confrelid = p_table
          AND array_length(c.conkey, 1) = 1
          AND c.confdeltype NOT IN ('n', 'd')
          AND c.conrelid <> p_table
    LOOP
        EXECUTE format('SELECT array_agg(%I::text) FROM %s WHERE %I::text = ANY($1)', fk.parent_col, p_table, p_key_col)
            INTO parent_vals USING p_vals;
        CONTINUE WHEN parent_vals IS NULL;

        SELECT a.attname INTO child_pk
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
        WHERE i.indrelid = fk.child AND i.indisprimary AND i.indnatts = 1;

        IF child_pk IS NOT NULL THEN
            EXECUTE format('SELECT array_agg(%I::text) FROM %s WHERE %I::text = ANY($1)', child_pk, fk.child, fk.child_col)
                INTO child_vals USING parent_vals;
            PERFORM public._purge_rows(fk.child, child_pk, child_vals, p_depth + 1);
        END IF;

        EXECUTE format('DELETE FROM %s WHERE %I::text = ANY($1)', fk.child, fk.child_col) USING parent_vals;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_store(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    PERFORM public._purge_rows('public.stores'::regclass, 'id', ARRAY[p_store_id::text]);
    DELETE FROM public.stores WHERE id = p_store_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_profile(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    s record;
BEGIN
    FOR s IN SELECT id FROM public.stores WHERE owner_id = p_user_id LOOP
        PERFORM public.admin_delete_store(s.id);
    END LOOP;
    PERFORM public._purge_rows('public.profiles'::regclass, 'id', ARRAY[p_user_id::text]);
    DELETE FROM public.profiles WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public._purge_rows(regclass, text, text[], integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_store(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_profile(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_store(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_profile(uuid) TO service_role;
