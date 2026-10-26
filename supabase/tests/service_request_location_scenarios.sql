-- Cenários da localização exata do pedido de serviço (migration 20261128), numa transação desfeita:
--   psql ... -f supabase/tests/service_request_location_scenarios.sql
begin;
do $$
declare
    req uuid; requester uuid; chosen uuid; waiting uuid; stranger uuid; v jsonb;
begin
    select id, requester_id into req, requester from service_requests where status = 'pending' order by random() limit 1;
    select id into chosen from profiles where id <> requester order by random() limit 1;
    select id into waiting from profiles where id not in (requester, chosen) order by random() limit 1;
    select id into stranger from profiles where id not in (requester, chosen, waiting) order by random() limit 1;
    insert into service_applications (service_request_id, applicant_id, status) values (req, chosen, 'accepted') on conflict do nothing;
    insert into service_applications (service_request_id, applicant_id, status) values (req, waiting, 'pending') on conflict do nothing;
    update service_applications set status = 'accepted' where service_request_id = req and applicant_id = chosen;

    -- quem pediu guarda a coordenada exata
    perform set_config('request.jwt.claims', json_build_object('sub', requester, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into service_request_private (request_id, lat, lng) values (req, -8.7612345, -63.9034567) on conflict (request_id) do update set lat = excluded.lat, lng = excluded.lng;
    v := get_service_request_location(req);
    assert (v->>'lat')::float8 = -8.7612345 and (v->>'lng')::float8 = -63.9034567, 'quem pediu não recebeu a coordenada exata';

    -- o escolhido recebe endereço e coordenada exata
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', chosen, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v := get_service_request_location(req);
    assert v is not null and (v->>'lat')::float8 = -8.7612345 and v->>'address' is not null, 'o profissional escolhido não recebeu a localização';
    assert (select count(*) from service_request_private where request_id = req) = 0, 'o escolhido leu a tabela privada direto';

    -- candidato ainda sem resposta e estranho NÃO recebem; ninguém escreve na coordenada dos outros
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', waiting, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert get_service_request_location(req) is null, 'candidato pendente recebeu a localização';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert get_service_request_location(req) is null, 'estranho recebeu a localização';
    assert (select count(*) from service_request_private where request_id = req) = 0, 'estranho leu a coordenada direto';
    begin
        insert into service_request_private (request_id, lat, lng) values (req, 0, 0); assert false, 'estranho gravou coordenada em pedido alheio';
    exception when insufficient_privilege or others then
        assert sqlerrm like '%row-level security%' or sqlerrm like '%duplicate%' or sqlerrm like '%violates%', 'erro inesperado: ' || sqlerrm;
    end;
    reset role;
    -- a coluna pública continua só aproximada
    update service_requests set approx_lat = -8.7612345, approx_lng = -63.9034567 where id = req;
    assert (select approx_lat from service_requests where id = req) = -8.76, 'a posição pública não foi arredondada';
    -- ===== endereço completo (com número) fora da coluna pública =====
    declare new_req uuid; begin
        perform set_config('request.jwt.claims', json_build_object('sub', requester, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into service_requests (requester_id, service_type, location_address, description, photo_urls, status)
        values (requester, 'eletricista', 'Rua Teste Privada, 987, Bairro Secreto, Porto Velho - RO', 'teste de endereço privado', '{}', 'pending') returning id into new_req;
        reset role;
        assert (select location_address from service_requests where id = new_req) not like '%987%', 'o número ficou na coluna pública';
        assert (select location_address from service_requests where id = new_req) like 'Rua Teste Privada%Bairro Secreto%', 'o público perdeu rua/bairro: ' || (select location_address from service_requests where id = new_req);
        assert (select address from service_request_private where request_id = new_req) like '%987%', 'o completo não foi para o privado';
        -- quem pediu lê o completo direto; o estranho não lê nada
        perform set_config('request.jwt.claims', json_build_object('sub', requester, 'role', 'authenticated')::text, true);
        set local role authenticated;
        assert (select address from service_request_private where request_id = new_req) like '%987%', 'quem pediu não leu o próprio endereço';
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
        set local role authenticated;
        assert (select count(*) from service_request_private where request_id = new_req) = 0, 'estranho leu o endereço privado';
        assert (select location_address from service_requests where id = new_req) not like '%987%', 'estranho leu o número pela coluna pública';
        -- editar o endereço continua separando público e privado
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', requester, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update service_requests set location_address = 'Av. Nova, 55, Outro Bairro, Porto Velho - RO' where id = new_req;
        reset role;
        assert (select location_address from service_requests where id = new_req) not like '%55%', 'o número editado ficou público';
        assert (select address from service_request_private where request_id = new_req) like '%Av. Nova, 55%', 'o endereço editado não foi para o privado';
    end;
    raise notice 'service_request_location: todos os cenários passaram';
end $$;
rollback;
