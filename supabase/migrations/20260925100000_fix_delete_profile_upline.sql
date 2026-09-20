-- Excluir a conta de quem já convidou alguém falhava: profiles.upline_id é
-- uma FK auto-referente e _purge_rows ignora auto-referências. Os convidados
-- não são apagados — só perdem o vínculo com quem saiu.
CREATE OR REPLACE FUNCTION public.admin_delete_profile(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    s record;
BEGIN
    UPDATE public.profiles SET upline_id = NULL WHERE upline_id = p_user_id;
    FOR s IN SELECT id FROM public.stores WHERE owner_id = p_user_id LOOP
        PERFORM public.admin_delete_store(s.id);
    END LOOP;
    PERFORM public._purge_rows('public.profiles'::regclass, 'id', ARRAY[p_user_id::text]);
    DELETE FROM public.profiles WHERE id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_profile(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_profile(uuid) TO service_role;
