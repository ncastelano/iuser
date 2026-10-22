-- Cenários da regra "ninguém fica em dois lugares ao mesmo tempo" (migration 20261119). Rode: psql -f ... (tudo é desfeito no fim).
begin;
do $$
declare
    a uuid; b uuid; c uuid; st uuid; v_ok int := 0;
    d date := current_date + 40;
begin
    select id into a from profiles where "profileSlug" = 'rede-ana-usuaria';
    select id into b from profiles where "profileSlug" = 'rede-bruno-lider';
    select id into c from profiles where "profileSlug" = 'rede-carla-supervisora';
    select id into st from stores limit 1;
    delete from appointments where date = d;
    update profiles set allow_scheduling = true where id in (a, b);

    -- 1) B marca com A às 10:00 (60 min): ok
    insert into appointments (store_id, store_slug, store_name, provider_profile_id, owner_id, owner_slug, customer_id, customer_slug, date, time, duration_minutes, service_name, status, direction)
    values (null, '', '', a, a, 'a', b, 'b', d, '10:00', 60, 't1', 'pending', 'outgoing');

    -- 2) C tenta o mesmo horário com A (sobrepõe 10:30): barrado como indisponível
    begin
        insert into appointments (store_id, store_slug, store_name, provider_profile_id, owner_id, owner_slug, customer_id, customer_slug, date, time, duration_minutes, service_name, status, direction)
        values (null, '', '', a, a, 'a', c, 'c', d, '10:30', 30, 't2', 'pending', 'outgoing');
        raise exception 'FALHOU 2: deixou marcar em cima';
    exception when others then
        if sqlerrm like 'FALHOU%' then raise; end if;
        if sqlerrm <> 'Esse horário não está mais disponível. Escolha outro.' then raise exception 'FALHOU 2: mensagem %', sqlerrm; end if;
    end;

    -- 3) A (que está ocupada atendendo B) tenta marcar numa loja no mesmo horário: barrado
    begin
        insert into appointments (store_id, store_slug, store_name, provider_profile_id, owner_id, owner_slug, customer_id, customer_slug, date, time, duration_minutes, service_name, status, direction)
        values (st, 's', 's', null, c, 'c', a, 'a', d, '10:15', 30, 't3', 'pending', 'outgoing');
        raise exception 'FALHOU 3: deixou a pessoa em dois lugares';
    exception when others then
        if sqlerrm like 'FALHOU%' then raise; end if;
        if sqlerrm <> 'Você já tem outro compromisso nesse horário.' then raise exception 'FALHOU 3: mensagem %', sqlerrm; end if;
    end;

    -- 4) B (cliente de A às 10:00) tenta uma loja às 10:30: barrado
    begin
        insert into appointments (store_id, store_slug, store_name, provider_profile_id, owner_id, owner_slug, customer_id, customer_slug, date, time, duration_minutes, service_name, status, direction)
        values (st, 's', 's', null, c, 'c', b, 'b', d, '10:30', 30, 't4', 'pending', 'outgoing');
        raise exception 'FALHOU 4';
    exception when others then
        if sqlerrm like 'FALHOU%' then raise; end if;
    end;

    -- 5) encostado (11:00, logo depois das 10-11): ok
    insert into appointments (store_id, store_slug, store_name, provider_profile_id, owner_id, owner_slug, customer_id, customer_slug, date, time, duration_minutes, service_name, status, direction)
    values (null, '', '', a, a, 'a', c, 'c', d, '11:00', 60, 't5', 'pending', 'outgoing');

    -- 6) cancelado libera o horário: cancela o das 10:00 e outro cliente (C não, ocupado 11h) — B marca às 10:00 de novo? usa D na loja
    update appointments set status = 'cancelled' where service_name = 't1' and date = d;
    insert into appointments (store_id, store_slug, store_name, provider_profile_id, owner_id, owner_slug, customer_id, customer_slug, date, time, duration_minutes, service_name, status, direction)
    values (st, 's', 's', null, c, 'c', a, 'a', d, '10:15', 30, 't6', 'confirmed', 'outgoing');

    -- 7) aceitar (pending -> confirmed) um que já existia não é barrado
    update appointments set status = 'confirmed' where service_name = 't5' and date = d;

    -- 8) compromisso pessoal (cliente = prestador) não disputa horário
    insert into appointments (store_id, store_slug, store_name, provider_profile_id, owner_id, owner_slug, customer_id, customer_slug, date, time, duration_minutes, service_name, status, direction)
    values (null, '', '', b, b, 'b', b, 'b', d, '11:00', 60, 't8', 'confirmed', 'outgoing');

    raise notice 'appointment_overlap_scenarios: TODOS OS CENÁRIOS PASSARAM';
end $$;
rollback;
