-- Cenários da visualização única por pessoa (20261130000143). Transação desfeita. Só LOCAL.
--   docker exec -i supabase_db_iuser-local psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/view_once_scenarios.sql
begin;
set local session_replication_role = replica; -- pula gatilhos de arquivo (o teste não sobe um R2 de verdade)
do $$
declare
    c uuid; o uuid; conv uuid; m uuid; k text; v_err text; n int;
begin
    select customer_id, owner_profile_id, id into c, o, conv
      from public.conversations where owner_profile_id is not null and customer_id is not null limit 1;
    assert c is not null, 'precisa de uma conversa 1 a 1 no banco local';

    -- a cliente envia uma foto de visualização única para a dona
    insert into public.direct_messages (conversation_id, sender_id, content, kind, media_key, view_once)
    values (conv, c, 'Foto', 'photo', gen_random_uuid()::text || '/' || gen_random_uuid()::text || '.jpg', true)
    returning id into m;

    -- quem enviou não abre a própria foto
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
        perform public.chat_open_view_once(m);
        raise exception 'deveria recusar abrir pelo remetente';
    exception when others then
        if sqlerrm = 'deveria recusar abrir pelo remetente' then raise; end if;
    end;
    reset role;

    -- quem recebe abre uma vez
    perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
    set local role authenticated;
    k := public.chat_open_view_once(m);
    assert k is not null, 'quem recebe deveria receber a chave';
    begin
        perform public.chat_open_view_once(m);
        raise exception 'deveria recusar a segunda abertura';
    exception when others then
        if sqlerrm = 'deveria recusar a segunda abertura' then raise; end if;
        get stacked diagnostics v_err = message_text;
    end;
    reset role;

    select count(*) into n from public.direct_message_views where message_id = m and profile_id = o;
    assert n = 1, 'a visualização deveria ficar registrada uma vez';
    assert (select viewed_at is not null from public.direct_messages where id = m), 'o remetente deveria ver "visualizada"';
    raise notice 'OK — visualização única: remetente não abre, quem recebe abre uma vez, a segunda é recusada';
end $$;
rollback;
