-- Cenários do aviso de novidade na barra do aparelho (20261130000146). Transação desfeita. Só LOCAL.
--   docker exec -i supabase_db_iuser-local psql -v ON_ERROR_STOP=1 -U supabase_admin -h 127.0.0.1 -d postgres < supabase/tests/update_announcements_scenarios.sql
begin;
set local session_replication_role = replica;
do $$
declare
    a uuid; b uuid; rel uuid; n int; got uuid[]; pend int;
begin
    select id into a from public.profiles where is_blocked is not true order by created_at limit 1;
    select id into b from public.profiles where is_blocked is not true and id <> a order by created_at limit 1;
    select id into rel from public.forum_releases limit 1;
    assert a is not null and b is not null and rel is not null, 'precisa de 2 pessoas e uma novidade no banco local';
    -- os dois têm aparelho com notificação
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (a, 'https://teste.local/a-' || a, 'k', 'k'), (b, 'https://teste.local/b-' || b, 'k', 'k');

    -- padrão: ligado
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert public.get_update_notifications() = true, 'o padrão deveria ser ligado';
    reset role;

    -- a outra pessoa desliga
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert public.set_update_notifications(false) = false, 'desligar não gravou';
    assert public.get_update_notifications() = false, 'o interruptor não ficou desligado';
    reset role;
    raise notice 'ok: padrão ligado; quem desliga fica desligado';

    -- o serviço enfileira: entra quem está ligado, não entra quem desligou
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    pend := public.admin_forum_announce(rel);
    select count(*) into n from public.update_announcement_queue where release_id = rel and profile_id = b;
    assert n = 0, 'quem desligou não deveria estar na fila';
    select count(*) into n from public.update_announcement_queue where release_id = rel and profile_id = a;
    assert n = 1, 'quem está ligado deveria estar na fila';
    -- enfileirar de novo não duplica
    perform public.admin_forum_announce(rel);
    select count(*) into n from public.update_announcement_queue where release_id = rel and profile_id = a;
    assert n = 1, 'enfileirar duas vezes duplicou';
    raise notice 'ok: fila só com quem está ligado, sem duplicar';

    -- o lote marca antes de enviar: a 2ª chamada não devolve a mesma pessoa
    got := array(select public.admin_forum_announce_claim(rel, 100));
    assert a = any(got), 'o lote deveria trazer a pessoa ligada';
    got := array(select public.admin_forum_announce_claim(rel, 100));
    assert not (a = any(got)), 'o mesmo aviso não pode sair duas vezes';
    raise notice 'ok: cada aviso sai uma vez';

    -- quem desligou depois de entrar na fila não recebe
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.set_update_notifications(false);
    reset role;
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    perform public.admin_forum_announce(rel);
    update public.update_announcement_queue set sent_at = null where release_id = rel and profile_id = a;
    got := array(select public.admin_forum_announce_claim(rel, 100));
    assert not (a = any(got)), 'quem desligou depois não deveria receber';
    raise notice 'ok: desligar depois de enfileirar também vale';

    -- a chamada do público não mexe nisso
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    begin
        perform public.admin_forum_announce(rel);
        raise exception 'deveria recusar quem não é o serviço';
    exception when others then
        if sqlerrm = 'deveria recusar quem não é o serviço' then raise; end if;
    end;
    raise notice 'ok: só o serviço enfileira';

    raise notice 'OK — avisos de novidade passaram nos cenários';
end $$;
rollback;
