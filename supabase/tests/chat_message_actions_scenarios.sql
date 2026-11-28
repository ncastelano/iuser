-- Cenários das ações de mensagem (responder, reagir, editar, apagar, visto). Transação desfeita no fim.
-- Só LOCAL. Rodar:
--   docker exec -i supabase_db_iuser-local psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/chat_message_actions_scenarios.sql
-- Se algum passo falhar, a mensagem diz qual. Sem erro = todos passaram (o último NOTICE diz "OK").
begin;
do $$
declare
    c uuid; o uuid; conv uuid; conv2 uuid;
    m1 uuid; m2 uuid; v_emoji text; v_row record; v_err text; v_at timestamptz;
begin
    select customer_id, owner_profile_id, id into c, o, conv
      from public.conversations where owner_profile_id is not null and customer_id is not null limit 1;
    select id into conv2 from public.conversations where id <> conv limit 1;
    assert c is not null and conv2 is not null, 'precisa de 2 conversas no banco local';

    -- entra como a cliente (a RLS e as funções leem auth.uid())
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;

    insert into public.direct_messages (conversation_id, sender_id, content) values (conv, c, 'mensagem para testar') returning id into m1;
    insert into public.direct_messages (conversation_id, sender_id, content, reply_to_id) values (conv, c, 'resposta', m1) returning id into m2;
    raise notice 'ok: responder na mesma conversa';

    -- responder mensagem de OUTRA conversa é recusado
    begin
        insert into public.direct_messages (conversation_id, sender_id, content, reply_to_id) values (conv2, c, 'cruzada', m1);
        raise exception 'deveria recusar resposta cruzada';
    exception when others then
        if sqlerrm = 'deveria recusar resposta cruzada' then raise; end if;
    end;
    raise notice 'ok: resposta de outra conversa é recusada';

    -- reagir: a primeira põe, a segunda (mesmo emoji) tira; emoji fora da lista é recusado
    v_emoji := public.chat_react(m1, '👍');
    assert v_emoji = '👍', 'reação não entrou';
    assert public.chat_react(m1, '👍') is null, 'tocar de novo deveria tirar a reação';
    begin
        perform public.chat_react(m1, '🤡');
        raise exception 'deveria recusar emoji fora da lista';
    exception when others then
        if sqlerrm = 'deveria recusar emoji fora da lista' then raise; end if;
    end;
    raise notice 'ok: reagir liga, desliga e recusa emoji fora da lista';

    -- editar dentro de 15 min
    perform public.chat_edit_message(m1, 'texto editado');
    select content, edited_at into v_row from public.direct_messages where id = m1;
    assert v_row.content = 'texto editado' and v_row.edited_at is not null, 'edição não gravou';
    raise notice 'ok: editar dentro do prazo';

    -- depois de 15 min não edita mais (volta a ser o dono do banco para mexer na data)
    reset role;
    update public.direct_messages set created_at = now() - interval '20 minutes' where id = m1;
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
        perform public.chat_edit_message(m1, 'tarde demais');
        raise exception 'deveria recusar edição tardia';
    exception when others then
        if sqlerrm = 'deveria recusar edição tardia' then raise; end if;
    end;
    raise notice 'ok: editar depois de 15 min é recusado';

    -- a outra pessoa não apaga para todos a mensagem da cliente
    perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
    begin
        perform public.chat_delete_message(m2, true);
        raise exception 'deveria recusar apagar para todos de quem não enviou';
    exception when others then
        if sqlerrm = 'deveria recusar apagar para todos de quem não enviou' then raise; end if;
    end;
    raise notice 'ok: só quem enviou apaga para todos';

    -- a outra pessoa apaga para ela (só some para ela, o banco guarda a linha)
    perform public.chat_delete_message(m2, false);
    select count(*) into v_row from public.direct_message_hidden where message_id = m2 and profile_id = o;
    assert (select count(*) from public.direct_message_hidden where message_id = m2 and profile_id = o) = 1, 'apagar para mim não ocultou';
    raise notice 'ok: apagar para mim só oculta para quem apagou';

    -- a cliente apaga para todos a própria mensagem: conteúdo e arquivo saem, o registro fica
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    perform public.chat_delete_message(m2, true);
    select content, deleted_at, media_key into v_row from public.direct_messages where id = m2;
    assert v_row.deleted_at is not null and v_row.content = '', 'apagar para todos não limpou';
    raise notice 'ok: apagar para todos limpa o conteúdo';

    -- visto: a função responde para quem está na conversa
    perform public.chat_other_read_at(conv);
    raise notice 'ok: visto responde';

    raise notice 'OK — todos os cenários de ações de mensagem passaram';
end $$;
rollback;
