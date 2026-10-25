-- Entrada no agendamento (migration 20261116). Rodar SÓ no staging: python3 scripts/staging/apply-sql.py supabase/tests/appointment_deposit_scenarios.sql
-- Tudo dentro de uma transação desfeita no fim. Qualquer falha de verificação aborta com EXCEPTION.
begin;

do $$
declare
    v_store uuid; v_owner uuid; v_cust uuid; v_stranger uuid; v_svc uuid; v_price numeric;
    a_id uuid; r record; ok boolean;
begin
    select s.id, s.owner_id into v_store, v_owner from stores s where s."storeSlug" = 'clinica-mente-viva';
    select id into v_cust from profiles where "profileSlug" = 'cliente-teste';
    select id into v_stranger from profiles where "profileSlug" = 'diego-freitas-4';
    select p.id, p.price into v_svc, v_price from products p where p.store_id = v_store and p.type = 'service' and p.listing_type = 'sale' and p.price > 0 order by p.name limit 1;

    -- 1. sem Pix não dá para ligar a entrada
    update stores set pix_key = null where id = v_store;
    begin
        update stores set deposit_mode = 'percent', deposit_value = 30 where id = v_store;
        raise exception 'FALHOU: ligou entrada sem Pix';
    exception when others then
        if sqlerrm like 'FALHOU%' then raise; end if;
    end;
    update stores set pix_key = 'clinica@pix.teste', pix_key_type = 'email', deposit_mode = 'percent', deposit_value = 30, deposit_policy = 'Devolvemos se cancelar com 24 h.' where id = v_store;

    -- 2. o cliente marca mandando valores falsos: o banco recalcula
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into appointments (store_id, store_slug, store_name, provider_profile_id, date, time, duration_minutes, service_name, service_type, people_count, customer_id, customer_slug, customer_avatar_url, owner_id, owner_slug, status, direction, is_public, service_items, deposit_status, deposit_amount)
    values (v_store, 'clinica-mente-viva', 'Clínica', v_owner, current_date + 20, '10:00', 60, 'Teste', 'service', 1, v_cust, 'cliente-teste', '', v_owner, 'clinica-mente-viva', 'confirmed', 'outgoing', false,
            jsonb_build_array(jsonb_build_object('product_id', v_svc, 'quantity', 2)), 'paid', 0)
    returning id into a_id;
    select * into r from appointments where id = a_id;
    if r.deposit_status <> 'awaiting' or r.status::text <> 'pending' or r.deposit_amount <> round(v_price * 2 * 0.30, 2) or r.deposit_due_at is null then
        raise exception 'FALHOU: entrada calculada errada: % % % %', r.deposit_status, r.status, r.deposit_amount, r.deposit_due_at;
    end if;

    -- 3. o cliente não consegue marcar como pago direto
    begin
        update appointments set deposit_status = 'paid' where id = a_id;
        raise exception 'FALHOU: cliente marcou pago direto';
    exception when others then
        if sqlerrm like 'FALHOU%' then raise; end if;
    end;

    -- 4. estranho não vê a chave Pix; o cliente vê
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    set local role authenticated;
    if exists (select 1 from get_appointment_deposit(a_id)) then raise exception 'FALHOU: estranho viu a entrada'; end if;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into r from get_appointment_deposit(a_id);
    if r.pix_key <> 'clinica@pix.teste' or r.policy is null then raise exception 'FALHOU: cliente não recebeu o Pix/política'; end if;

    -- 5. cliente avisa "já paguei"
    perform report_appointment_deposit(a_id);
    if (select deposit_status from appointments where id = a_id) <> 'reported' then raise exception 'FALHOU: report'; end if;

    -- 6. o dono não confirma o agendamento sem confirmar a entrada
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
        update appointments set status = 'confirmed' where id = a_id;
        raise exception 'FALHOU: confirmou com entrada pendente';
    exception when others then
        if sqlerrm like 'FALHOU%' then raise; end if;
    end;
    perform confirm_appointment_deposit(a_id);
    select * into r from appointments where id = a_id;
    if r.deposit_status <> 'paid' or r.status::text <> 'confirmed' then raise exception 'FALHOU: confirm_deposit: % %', r.deposit_status, r.status; end if;
    perform refund_appointment_deposit(a_id);
    if (select deposit_status from appointments where id = a_id) <> 'refunded' then raise exception 'FALHOU: refund'; end if;

    -- 7. percentual sem escolher serviço é recusado
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
        insert into appointments (store_id, store_slug, store_name, provider_profile_id, date, time, duration_minutes, service_name, service_type, people_count, customer_id, customer_slug, customer_avatar_url, owner_id, owner_slug, status, direction, is_public)
        values (v_store, 'clinica-mente-viva', 'Clínica', v_owner, current_date + 21, '10:00', 60, 'Sem itens', 'service', 1, v_cust, 'cliente-teste', '', v_owner, 'clinica-mente-viva', 'pending', 'outgoing', false);
        raise exception 'FALHOU: percentual sem serviço passou';
    exception when others then
        if sqlerrm like 'FALHOU%' then raise; end if;
    end;

    -- 8. valor fixo, limitado ao valor do serviço
    reset role;
    update stores set deposit_mode = 'fixed', deposit_value = 100000 where id = v_store;
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into appointments (store_id, store_slug, store_name, provider_profile_id, date, time, duration_minutes, service_name, service_type, people_count, customer_id, customer_slug, customer_avatar_url, owner_id, owner_slug, status, direction, is_public, service_items)
    values (v_store, 'clinica-mente-viva', 'Clínica', v_owner, current_date + 22, '11:00', 60, 'Fixo', 'service', 1, v_cust, 'cliente-teste', '', v_owner, 'clinica-mente-viva', 'pending', 'outgoing', false,
            jsonb_build_array(jsonb_build_object('product_id', v_svc, 'quantity', 1)))
    returning id into a_id;
    if (select deposit_amount from appointments where id = a_id) <> v_price then raise exception 'FALHOU: fixo não ficou limitado ao valor do serviço'; end if;

    -- 9. prazo vencido: o job cancela e libera o horário
    reset role;
    perform set_config('app.deposit_rpc', '1', true);
    update appointments set deposit_due_at = now() - interval '1 minute' where id = a_id;
    perform expire_unpaid_appointment_deposits();
    select * into r from appointments where id = a_id;
    if r.status::text <> 'cancelled' or r.deposit_status <> 'expired' then raise exception 'FALHOU: expiração: % %', r.status, r.deposit_status; end if;

    -- 10. loja sem entrada: tudo como antes
    update stores set deposit_mode = 'none', deposit_value = 0 where id = v_store;
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into appointments (store_id, store_slug, store_name, provider_profile_id, date, time, duration_minutes, service_name, service_type, people_count, customer_id, customer_slug, customer_avatar_url, owner_id, owner_slug, status, direction, is_public)
    values (v_store, 'clinica-mente-viva', 'Clínica', v_owner, current_date + 23, '11:00', 60, 'Sem entrada', 'service', 1, v_cust, 'cliente-teste', '', v_owner, 'clinica-mente-viva', 'pending', 'outgoing', false)
    returning id into a_id;
    if (select deposit_status from appointments where id = a_id) <> 'none' then raise exception 'FALHOU: loja sem entrada gerou entrada'; end if;

    reset role;
    raise notice 'OK: todos os cenários da entrada passaram';
end $$;

rollback;
