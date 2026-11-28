-- Cenários dos avisos (campanhas de push), 20261130000149. Transação desfeita. Só LOCAL.
--   docker exec -i supabase_db_iuser-local psql -v ON_ERROR_STOP=1 -U supabase_admin -h 127.0.0.1 -d postgres < supabase/tests/push_campaigns_scenarios.sql
begin;
set local session_replication_role = replica;
do $$
declare
    s uuid; o uuid; p uuid; stranger uuid; cid uuid; n int; got uuid[]; v_err text;
begin
    select id, owner_id into s, o from public.stores where owner_id is not null and is_active limit 1;
    select id into p from public.profiles where id <> o and is_blocked is not true order by created_at limit 1;
    select id into stranger from public.profiles where id not in (o, p) and is_blocked is not true order by created_at desc limit 1;
    assert s is not null and p is not null and stranger is not null, 'precisa de uma loja e 3 pessoas no banco local';

    -- p segue a loja e tem aparelho com aviso; ligou Ofertas
    insert into public.follows (follower_id, following_id) values (p, o) on conflict do nothing;
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (p, 'https://teste.local/c-' || p, 'k', 'k');
    perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert public.set_promo_notifications(true) = true, 'ligar Ofertas não gravou';
    reset role;

    -- a loja (dona) envia para seguidores
    perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
    set local role authenticated;
    cid := public.campaign_create('Promoção da casa', 'Aproveite hoje', '/' || (select "storeSlug" from public.stores where id = s), 'store_followers', s, '{}', o);
    raise notice 'ok: a loja envia para os seguidores';
    -- de novo no mesmo dia: passa do limite da loja
    begin
        perform public.campaign_create('Outra', 'Outra', '/x', 'store_followers', s, '{}', o);
        raise exception 'deveria bloquear o 2º aviso do dia';
    exception when others then
        if sqlerrm = 'deveria bloquear o 2º aviso do dia' then raise; end if;
        get stacked diagnostics v_err = message_text;
    end;
    -- público que a loja não pode usar
    begin
        perform public.campaign_create('Todos', 'Todos', '/x', 'all', s, '{}', o);
        raise exception 'deveria recusar público geral para a loja';
    exception when others then
        if sqlerrm = 'deveria recusar público geral para a loja' then raise; end if;
    end;
    -- pessoa que não segue nem comprou
    begin
        perform public.campaign_create('Escolhida', 'Escolhida', '/x', 'people', s, array[stranger], o);
        raise exception 'deveria recusar quem não segue nem comprou';
    exception when others then
        if sqlerrm = 'deveria recusar quem não segue nem comprou' then raise; end if;
    end;
    -- link externo não passa
    begin
        perform public.campaign_create('Link', 'Link', 'https://fora.com', 'store_followers', s, '{}', o);
        raise exception 'deveria recusar link externo';
    exception when others then
        if sqlerrm = 'deveria recusar link externo' then raise; end if;
    end;
    reset role;
    raise notice 'ok: limite por dia, público restrito à loja, pessoa certa, link interno';

    -- entrou na fila só quem ligou Ofertas
    select count(*) into n from public.push_campaign_queue where campaign_id = cid and profile_id = p;
    assert n = 1, 'quem ligou Ofertas deveria estar na fila';

    -- a pessoa desliga Ofertas: o lote não manda para ela
    perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.set_promo_notifications(false);
    reset role;
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    got := array(select public.campaign_claim(cid, 100));
    assert not (p = any(got)), 'quem desligou Ofertas não pode receber';
    raise notice 'ok: desligar Ofertas tira da fila';

    -- administrador (serviço) pode mandar para todos, com quem o criou (a pessoa de teste liga Ofertas de novo)
    perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.set_promo_notifications(true);
    reset role;
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    perform public.campaign_create('Geral', 'Geral', '/forum', 'all', null, '{}', o);
    raise notice 'ok: administrador envia para todos';

    -- o cliente comum não cria aviso pelo app
    perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
        perform public.campaign_create('Golpe', 'Golpe', '/x', 'all', null, '{}', stranger);
        raise exception 'deveria recusar quem não é o administrador';
    exception when others then
        if sqlerrm = 'deveria recusar quem não é o administrador' then raise; end if;
    end;
    reset role;
    raise notice 'ok: só a loja (no próprio público) e o administrador criam aviso';

    raise notice 'OK — avisos passaram nos cenários';
end $$;
rollback;
